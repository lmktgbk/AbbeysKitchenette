import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { WebSocket } from "ws";
import { setTimeout as delay } from "node:timers/promises";
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("../src/infrastructure/realtime/auth.js", () => ({ extractUpgradeToken: req => req.headers.cookie?.split("=")[1] ?? null,
  resolveUser: vi.fn(), canSubscribe: (user, topic) => user.role === "admin" && topic === "orders" }));
import { resolveUser } from "../src/infrastructure/realtime/auth.js";
import { attachRealtimeServer } from "../src/infrastructure/realtime/server.js";
import { realtimeLimits } from "../src/infrastructure/realtime/limits.js";
import { topicStats, __reset } from "../src/infrastructure/realtime/hub.js";
import { revokeLocalSessions } from "../src/infrastructure/realtime/sessions.js";
const user = { id: "fixture", role: "admin", expiresAt: Date.now() + 3600000 };
const guest = number => `guest:00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
let server, realtime, url, sockets;
beforeEach(() => { __reset(); vi.mocked(resolveUser).mockReset().mockResolvedValue(user); sockets = []; });
afterEach(async () => {
  realtime?.stop(); sockets.forEach(socket => socket.terminate());
  if (realtime) await new Promise(resolve => realtime.wss.close(resolve));
  if (server) await new Promise(resolve => server.close(resolve));
  realtime = server = null; __reset();
});
async function start(overrides = {}, config = {}) {
  server = http.createServer();
  realtime = attachRealtimeServer(server, { config: { NODE_ENV: "test", WS_HEARTBEAT_MS: 25000, ...config }, limits: { ...realtimeLimits({}), ...overrides } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `ws://127.0.0.1:${server.address().port}/ws`;
}
function connect(options = {}, path = url) {
  const socket = new WebSocket(path, options); sockets.push(socket); socket.on("error", () => {});
  return socket;
}
const message = socket => new Promise(resolve => socket.once("message", raw => resolve(JSON.parse(String(raw)))));
const closed = socket => new Promise(resolve => socket.once("close", code => resolve(code)));
const rejected = socket => new Promise(resolve => socket.once("unexpected-response", (_, response) => {
  response.resume(); socket.terminate(); resolve(response.statusCode);
}));
async function open(options) { const socket = connect(options); await message(socket); return socket; }
async function request(socket, object) { const reply = message(socket); socket.send(JSON.stringify(object)); return reply; }
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(10); } throw Error("Condition did not settle"); }
describe("real WebSocket failure and resource boundaries", () => {
  it("accepts only the exact WebSocket path", async () => {
    await start(); expect(await rejected(connect({}, url + "-other"))).toBe(404);
    expect((await message(connect({}, url + "?fixture=1"))).type).toBe("hello");
  });
  it("limits connections per IP and reclaims a closed slot", async () => {
    await start({ perIp: 1 }); const first = await open();
    expect(await rejected(connect())).toBe(429); const done = closed(first); first.close(); await done;
    await until(() => realtime.stats().active === 0);
    expect((await message(connect())).type).toBe("hello");
  });
  it("counts pending authentication toward admission and ignores a disconnected upgrade", async () => {
    let finish; vi.mocked(resolveUser).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await start({ connections: 1 }); const waiting = connect({ headers: { Cookie: "token=fixture" } });
    await until(() => Boolean(finish)); expect(realtime.stats().pending).toBe(1);
    expect(await rejected(connect())).toBe(429);
    waiting.terminate(); await until(() => realtime.stats().active === 0); finish(user);
    await until(() => realtime.stats().authQueries === 0); expect(realtime.wss.clients.size).toBe(0);
    expect((await message(connect())).type).toBe("hello");
  });
  it("times out authentication while retaining the unsettled query's capacity slot", async () => {
    let finish; vi.mocked(resolveUser).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await start({ authTimeoutMs: 80, authQueries: 1 });
    const waiting = connect({ headers: { Cookie: "token=fixture" } }); const end = closed(waiting);
    await until(() => Boolean(finish)); await end;
    expect(realtime.stats().authQueries).toBe(1);
    const second = connect({ headers: { Cookie: "token=fixture2" } }); await closed(second);
    expect(resolveUser).toHaveBeenCalledTimes(1); finish(user);
    await until(() => realtime.stats().authQueries === 0);
  });
  it("rejects auth database failure instead of silently opening an anonymous socket", async () => {
    vi.mocked(resolveUser).mockRejectedValue({ statusCode: 503, message: "secret provider failure" });
    await start(); expect(await rejected(connect({ headers: { Cookie: "token=fixture" } }))).toBe(503);
  });
  it("does not register a session when message authentication resolves after disconnect", async () => {
    let finish; vi.mocked(resolveUser).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await start(); const socket = await open(); socket.send(JSON.stringify({ type: "auth", token: "fixture" }));
    await until(() => Boolean(finish)); const done = closed(socket); socket.terminate(); await done;
    finish(user); await until(() => realtime.stats().authQueries === 0);
    expect(() => revokeLocalSessions(user.id)).not.toThrow(); expect(topicStats()).toEqual({});
  });
  it("bounds subscriptions, deduplicates them and allows released topic slots", async () => {
    await start({ subscriptions: 2 }); const socket = await open();
    expect((await request(socket, { type: "subscribe", topic: guest(1) })).type).toBe("subscribed");
    await request(socket, { type: "subscribe", topic: guest(1) });
    await request(socket, { type: "subscribe", topic: guest(2) });
    expect((await request(socket, { type: "subscribe", topic: guest(3) })).code).toBe("SUBSCRIPTION_LIMIT");
    expect(Object.keys(topicStats())).toHaveLength(2);
    socket.send(JSON.stringify({ type: "unsubscribe", topic: guest(1) }));
    expect((await request(socket, { type: "subscribe", topic: guest(3) })).type).toBe("subscribed");
  });
  it("requires authentication and ACL before subscribing to staff data", async () => {
    await start(); const socket = await open();
    expect((await request(socket, { type: "subscribe", topic: "orders" })).code).toBe("UNAUTHORIZED");
    expect((await request(socket, { type: "auth", token: "fixture" })).type).toBe("ready");
    expect((await request(socket, { type: "subscribe", topic: "forbidden" })).code).toBe("FORBIDDEN");
    expect((await request(socket, { type: "subscribe", topic: "orders" })).type).toBe("subscribed");
  });
  it("handles malformed JSON, null, arrays and unexpected fields safely", async () => {
    await start(); const socket = await open();
    const reply = message(socket); socket.send("{"); expect((await reply).code).toBe("BAD_MESSAGE");
    for (const input of [null, [], { type: 1 }, { type: "subscribe", topic: {} }, { type: "subscribe", topic: "x".repeat(129) }]) {
      expect((await request(socket, input)).code).toBe("BAD_MESSAGE");
    }
    expect((await request(socket, { type: "ping" })).type).toBe("pong");
  });
  it("rejects binary data and oversized payloads with protocol close codes", async () => {
    await start({ payload: 256 }); const binary = await open(); const binaryEnd = closed(binary);
    binary.send(Buffer.from("{}")); expect(await binaryEnd).toBe(1003);
    const huge = await open(); const hugeEnd = closed(huge); huge.send("x".repeat(257)); expect(await hugeEnd).toBe(1009);
  });
  it("disconnects a message flood before unlimited database work can start", async () => {
    await start({ messages: 5 }); const socket = await open(); const done = closed(socket);
    for (let i = 0; i < 6; i++) socket.send(JSON.stringify({ type: "ping" }));
    expect(await done).toBe(4408); expect(resolveUser).not.toHaveBeenCalled();
  });
  it("applies the same budget to WebSocket control-frame floods", async () => {
    await start({ messages: 5 }); const socket = await open(); const done = closed(socket);
    for (let i = 0; i < 6; i++) socket.pong();
    expect(await done).toBe(4408);
  });
  it("processes simultaneous auth messages once and preserves following messages", async () => {
    let finish; vi.mocked(resolveUser).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await start(); const socket = await open(); const replies = [];
    socket.on("message", raw => replies.push(JSON.parse(String(raw))));
    socket.send(JSON.stringify({ type: "auth", token: "fixture" })); await until(() => Boolean(finish));
    socket.send(JSON.stringify({ type: "auth", token: "fixture" })); socket.send(JSON.stringify({ type: "ping" }));
    finish(user); await until(() => replies.length === 2);
    expect(replies.map(row => row.type)).toEqual(["ready", "pong"]); expect(resolveUser).toHaveBeenCalledTimes(1);
  });
  it("serializes auth requests and closes excessive pending work", async () => {
    let finish; vi.mocked(resolveUser).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await start({ pendingMessages: 2 }); const socket = await open(); const done = closed(socket);
    socket.send(JSON.stringify({ type: "auth", token: "fixture" })); await until(() => Boolean(finish));
    for (let i = 0; i < 3; i++) socket.send(JSON.stringify({ type: "auth", token: "fixture" }));
    expect(await done).toBe(4408); expect(resolveUser).toHaveBeenCalledTimes(1); finish(user);
    await until(() => realtime.stats().authQueries === 0);
  });
  it("shutdown rejects new upgrades and fences pending authentication", async () => {
    let finish; vi.mocked(resolveUser).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await start(); const active = await open(); const activeEnd = closed(active);
    const waiting = connect({ headers: { Cookie: "token=fixture" } }); const waitingEnd = closed(waiting);
    await until(() => Boolean(finish)); realtime.stop();
    expect(await activeEnd).toBe(1001); await waitingEnd;
    expect(await rejected(connect())).toBe(503); finish(user);
    await until(() => realtime.stats().authQueries === 0); expect(realtime.wss.clients.size).toBe(0);
  });
  it("revalidates more connected sessions than the auth query budget without rejecting healthy users", async () => {
    await start({ authQueries: 2 }, { WS_HEARTBEAT_MS: 30 });
    for (let i = 0; i < 5; i++) await open({ headers: { Cookie: "token=fixture" } });
    await until(() => vi.mocked(resolveUser).mock.calls.length >= 10);
    expect(realtime.wss.clients.size).toBe(5);
    vi.mocked(resolveUser).mockRejectedValue({ statusCode: 401 });
    await until(() => realtime.wss.clients.size === 0); expect(topicStats()).toEqual({});
  });
  it("queues a healthy reconnect burst instead of rejecting devices above query concurrency", async () => {
    let inFlight = 0, peak = 0;
    vi.mocked(resolveUser).mockImplementation(async () => {
      inFlight++; peak = Math.max(peak, inFlight); await delay(20); inFlight--; return user;
    });
    await start({ authQueries: 2 });
    const results = await Promise.all(Array.from({ length: 8 }, () => message(connect({ headers: { Cookie: "token=fixture" } }))));
    expect(results.every(reply => reply.type === "ready")).toBe(true); expect(peak).toBe(2);
    expect(realtime.wss.clients.size).toBe(8);
  });
});
