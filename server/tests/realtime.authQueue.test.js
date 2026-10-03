import { describe, it, expect, vi } from "vitest";
import { createAuthQueue } from "../src/realtime/authQueue.js";
describe("bounded realtime authentication queue", () => {
  it("queues a normal connection burst while limiting actual queries", async () => {
    const finishes = [];
    const lookup = vi.fn(token => new Promise(resolve => { finishes.push(() => resolve(token)); }));
    const queue = createAuthQueue(lookup, { capacity: 1, queued: 2, timeoutMs: 1000 });
    const first = queue.resolve("first"), second = queue.resolve("second"), third = queue.resolve("third");
    await expect(queue.resolve("fourth")).rejects.toMatchObject({ code: "AUTH_BUSY" });
    await Promise.resolve(); expect(lookup).toHaveBeenCalledTimes(1); expect(queue.stats()).toEqual({ authQueries: 1, authWaiting: 2 });
    finishes[0](); expect(await first).toBe("first");
    await vi.waitFor(() => expect(finishes).toHaveLength(2)); finishes[1](); expect(await second).toBe("second");
    await vi.waitFor(() => expect(finishes).toHaveLength(3)); finishes[2](); expect(await third).toBe("third");
  });
  it("cancels expired waiters but retains capacity for an unsettled query", async () => {
    vi.useFakeTimers();
    try {
      let finish; const lookup = vi.fn(() => new Promise(resolve => { finish = resolve; }));
      const queue = createAuthQueue(lookup, { capacity: 1, timeoutMs: 100 });
      const first = queue.resolve("first").catch(error => error), second = queue.resolve("second").catch(error => error);
      await vi.advanceTimersByTimeAsync(100);
      expect((await first).code).toBe("AUTH_TIMEOUT"); expect((await second).code).toBe("AUTH_TIMEOUT");
      expect(queue.stats()).toEqual({ authQueries: 1, authWaiting: 0 }); expect(lookup).toHaveBeenCalledTimes(1);
      finish("late"); await vi.advanceTimersByTimeAsync(0); expect(queue.stats().authQueries).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("skips disconnected callers and cancels queued work on shutdown", async () => {
    let finish; const lookup = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const queue = createAuthQueue(lookup, { capacity: 1, timeoutMs: 1000 });
    const first = queue.resolve("first"), disconnected = queue.resolve("closed", () => false).catch(error => error);
    await Promise.resolve(); finish("first"); await first;
    expect((await disconnected).code).toBe("AUTH_UNAVAILABLE"); expect(lookup).toHaveBeenCalledTimes(1);
    const active = queue.resolve("active"); await Promise.resolve();
    const waiting = queue.resolve("waiting").catch(error => error); queue.stop();
    expect((await waiting).code).toBe("AUTH_UNAVAILABLE"); await expect(queue.resolve("later")).rejects.toMatchObject({ statusCode: 503 });
    finish("active"); await active;
  });
});
