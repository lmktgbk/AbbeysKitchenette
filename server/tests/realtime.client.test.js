import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

let client, instances;
class FakeWebSocket {
  static OPEN = 1;
  readyState = 0;
  sent = [];
  constructor(url) { this.url = url; instances.push(this); }
  send(value) { this.sent.push(JSON.parse(value)); }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("window", { location: { origin: "https://app.example.com" } });
  vi.stubEnv("VITE_API_URL", "https://api.example.com/api");
  vi.stubEnv("VITE_WS_URL", ""); vi.stubEnv("VITE_REALTIME", "on");
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  client = await import("../../client/src/realtime/socket.js");
});
afterEach(() => { client?.stopRealtime(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("browser realtime reconnect and data resync", () => {
  it("refreshes denied staff subscriptions through the existing REST authorization path", () => {
    const refresh = vi.fn(); client.subscribeRealtime("orders", refresh); instances[0].open();
    instances[0].receive({ type: "error", code: "UNAUTHORIZED", topic: "orders" });
    expect(refresh).toHaveBeenCalledWith({ type: "resync", topic: "orders" });
  });
  it("derives the socket origin from the deployed API and respects an override", () => {
    client.startRealtime(); expect(instances[0].url).toBe("wss://api.example.com/ws"); client.stopRealtime();
    vi.stubEnv("VITE_WS_URL", "wss://override.example.com/ws"); client.startRealtime();
    expect(instances[1].url).toBe("wss://override.example.com/ws");
  });
  it("resubscribes and invokes data refresh after a reconnect acknowledgement", async () => {
    const refresh = vi.fn(); client.subscribeRealtime("orders", refresh);
    const first = instances[0]; first.open(); expect(first.sent).toEqual([{ type: "subscribe", topic: "orders" }]);
    first.receive({ type: "subscribed", topic: "orders" }); expect(refresh).toHaveBeenLastCalledWith({ type: "resync", topic: "orders" });
    first.close(); expect(client.realtimeStatus()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000); const next = instances[1]; next.open();
    expect(next.sent).toEqual([{ type: "subscribe", topic: "orders" }]);
    expect(refresh).toHaveBeenCalledTimes(1); next.receive({ type: "subscribed", topic: "orders" });
    expect(refresh).toHaveBeenCalledTimes(2);
    next.receive({ type: "event", topic: "orders", id: "changed" }); expect(refresh).toHaveBeenCalledTimes(3);
  });
  it("sends one subscription for shared handlers and unsubscribes only the last", () => {
    const a = vi.fn(), b = vi.fn(); const removeA = client.subscribeRealtime("orders", a); instances[0].open();
    const removeB = client.subscribeRealtime("orders", b);
    expect(instances[0].sent).toHaveLength(1);
    instances[0].receive({ type: "subscribed", topic: "orders" }); expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(1);
    removeA(); expect(instances[0].sent).toHaveLength(1); removeB();
    expect(instances[0].sent[1]).toEqual({ type: "unsubscribe", topic: "orders" });
  });
  it("ignores callbacks from the previous session after stop and immediate restart", async () => {
    const refresh = vi.fn(); client.subscribeRealtime("orders", refresh); const old = instances[0];
    client.stopRealtime(); client.startRealtime(); const next = instances[1]; next.open();
    old.onopen(); old.receive({ type: "event", topic: "orders" }); old.onclose(); old.onerror();
    expect(refresh).not.toHaveBeenCalled(); expect(client.realtimeStatus()).toBe("live"); expect(next.readyState).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); expect(instances).toHaveLength(2);
  });
  it("stops pending reconnects and heartbeat timers", async () => {
    client.startRealtime(); instances[0].open(); instances[0].close(); client.stopRealtime();
    await vi.advanceTimersByTimeAsync(60000); expect(instances).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("reconnects a silent connection and accepts malformed server messages safely", async () => {
    const refresh = vi.fn(); client.subscribeRealtime("orders", refresh); const socket = instances[0]; socket.open();
    socket.receive(null); socket.receive([]); socket.onmessage({ data: "{" }); expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20000); expect(socket.sent.at(-1)).toEqual({ type: "ping" });
    await vi.advanceTimersByTimeAsync(5000); expect(client.realtimeStatus()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1000); expect(instances).toHaveLength(2);
  });
});
