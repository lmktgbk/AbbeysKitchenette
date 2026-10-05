import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import http from "node:http";
import { WebSocket } from "ws";
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "production", CLIENT_URL: "https://app.example.com", WS_HEARTBEAT_MS: 25000 } }));
vi.mock("../src/infrastructure/realtime/auth.js", () => ({ extractUpgradeToken: () => null, resolveUser: vi.fn(async () => { throw Error("No session"); }), canSubscribe: () => false }));
import { resolveUser } from "../src/infrastructure/realtime/auth.js";
import { attachRealtimeServer } from "../src/infrastructure/realtime/server.js";
describe("production WebSocket ingress", () => {
  let server, realtime, url;
  beforeAll(async () => {
    server = http.createServer(); realtime = attachRealtimeServer(server);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    url = `ws://127.0.0.1:${server.address().port}/ws`;
  });
  afterAll(async () => {
    realtime.stop(); for (const socket of realtime.wss.clients) socket.terminate();
    await new Promise(resolve => realtime.wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  });
  it.each([undefined, "https://attacker.example", "null"])("rejects origin %s before session lookup", async origin => {
    vi.mocked(resolveUser).mockClear();
    const status = await new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { origin }); socket.on("error", reject);
      socket.on("unexpected-response", (_, response) => { response.resume(); socket.terminate(); resolve(response.statusCode); });
    });
    expect(status).toBe(403); expect(resolveUser).not.toHaveBeenCalled();
  });
  it("allows the configured frontend through upgrade without granting authenticated topics", async () => {
    const response = await new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { origin: "https://app.example.com" }); socket.on("error", reject);
      socket.on("message", raw => { socket.close(); resolve(JSON.parse(String(raw))); });
    });
    expect(response.type).toBe("hello");
  });
});
