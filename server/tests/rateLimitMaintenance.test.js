import { describe, it, expect, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test" } }));
import { PostgresRateLimitStore } from "../src/middleware/rateLimit.store.js";
import { createRateLimitMaintenance } from "../src/infrastructure/rateLimit/rateLimitMaintenance.js";
describe("rate protection failure handling", () => {
  it("fails closed with a safe 503 when storage is unavailable", async () => {
    const store = new PostgresRateLimitStore("fixture", { $queryRaw: vi.fn(async () => { throw Error("secret connection string"); }) });
    store.init({ windowMs: 1000 });
    await expect(store.increment("client")).rejects.toMatchObject({ statusCode: 503, code: "RATE_LIMIT_STORAGE_UNAVAILABLE" });
    await expect(store.increment("client")).rejects.not.toThrow("secret");
  });
  it("shutdown waits for cleanup and does not schedule another sweep", async () => {
    vi.useFakeTimers();
    try {
      let finish; const prune = vi.fn(() => new Promise(resolve => { finish = resolve; }));
      const worker = createRateLimitMaintenance({ enabled: true, prune, intervalMs: 1000 });
      worker.start(); worker.start(); expect(prune).toHaveBeenCalledTimes(1);
      let stopped = false; const stop = worker.stop().then(() => { stopped = true; });
      await Promise.resolve(); expect(stopped).toBe(false); finish(); await stop;
      await vi.advanceTimersByTimeAsync(3000); expect(prune).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
