import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
vi.mock("../src/config/env.js", () => ({ env: {} }));
import { createAdmission, realtimeLimits, upgradeClientKey, consumeMessage, sendBounded } from "../src/infrastructure/realtime/limits.js";
import { subscribe, broadcast, topicStats, __reset } from "../src/infrastructure/realtime/hub.js";
describe("realtime resource accounting", () => {
  const defaults = realtimeLimits({});
  it("reserves HTTP database headroom instead of allocating the whole pool to sockets", () => {
    expect(defaults.authQueries).toBe(4);
    expect(realtimeLimits({ DATABASE_POOL_SIZE: 4 }).authQueries).toBe(2);
    expect(realtimeLimits({ DATABASE_POOL_SIZE: 1 }).authQueries).toBe(1);
  });
  it("reserves pending connections and releases a slot only once", () => {
    const gate = createAdmission({ ...defaults, connections: 2, perIp: 1 });
    const a = gate.reserve("a"); expect(gate.reserve("a")).toBeNull();
    const b = gate.reserve("b"); expect(gate.reserve("c")).toBeNull();
    a(); a(); expect(gate.stats().active).toBe(1); expect(gate.reserve("c")).toBeTypeOf("function"); b();
  });
  it("caps IP records, attempt rate and expiry without evicting active slots", () => {
    let now = 0;
    const gate = createAdmission({ ...defaults, ipBuckets: 2, upgradesPerMinute: 2 }, () => now);
    const a = gate.reserve("a"), b = gate.reserve("b");
    expect(gate.reserve("c")).toBeNull(); a();
    const again = gate.reserve("a"); again(); expect(gate.reserve("a")).toBeNull();
    now = 60001; gate.prune(); expect(gate.stats()).toEqual({ active: 1, buckets: 1 });
    expect(gate.reserve("c")).toBeTypeOf("function"); b();
  });
  it("enforces a global upgrade rate even when client keys rotate", () => {
    const gate = createAdmission({ ...defaults, globalUpgradesPerMinute: 2 });
    gate.reserve("a")(); gate.reserve("b")(); expect(gate.reserve("c")).toBeNull();
  });
  it("matches Express proxy hop rules and groups IPv6 subnet rotation", () => {
    const request = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.10" } };
    expect(upgradeClientKey(request, { TRUST_PROXY_HOPS: 1 })).toBe("203.0.113.10");
    expect(upgradeClientKey(request, { TRUST_PROXY_HOPS: 0 })).toBe("127.0.0.1");
    const key = ip => upgradeClientKey({ socket: { remoteAddress: ip }, headers: {} }, {});
    expect(key("2001:db8::1")).toBe(key("2001:db8::2"));
  });
  it("bounds bursts and replenishes only at the configured rate", () => {
    const socket = {};
    expect(consumeMessage(socket, 5, 0)).toBe(true);
    for (let i = 0; i < 4; i++) expect(consumeMessage(socket, 5, 0)).toBe(true);
    expect(consumeMessage(socket, 5, 0)).toBe(false);
    expect(consumeMessage(socket, 5, 1000)).toBe(false);
    expect(consumeMessage(socket, 5, 2000)).toBe(true);
  });
  it("disconnects and prunes a slow consumer rather than growing its buffer", async () => {
    vi.useFakeTimers(); __reset();
    try {
      const socket = Object.assign(new EventEmitter(), { readyState: 1, __topics: new Set(), __maxBuffered: 256,
        bufferedAmount: 250, send: vi.fn(), close: vi.fn(), terminate: vi.fn() });
      subscribe(socket, "orders"); expect(broadcast("orders", { id: "fixture" })).toBe(0);
      expect(socket.send).not.toHaveBeenCalled(); expect(socket.close).toHaveBeenCalledWith(4408, "slow consumer");
      expect(topicStats()).toEqual({}); expect(sendBounded(socket, "x")).toBe(false);
      await vi.advanceTimersByTimeAsync(1000); expect(socket.terminate).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); __reset(); }
  });
});
