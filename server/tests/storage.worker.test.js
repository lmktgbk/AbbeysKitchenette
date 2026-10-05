import { describe, it, expect, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
vi.mock("../src/config/env.js", () => ({ env: {} }));
vi.mock("../src/config/cloudinary.js", () => ({ default: {} }));
import { createStorageWorker } from "../src/infrastructure/storage/storage.worker.js";
const asset = { asset_id: "fixture", public_id: "abbseys-kitchenette/products/fixture", owner: "owner" };
function fixture(results, destroy = vi.fn(async () => ({ result: "ok" })), options = {}) {
  const repository = { claim: vi.fn(async () => results.shift() ?? null), finish: vi.fn(async () => 1) };
  const worker = createStorageWorker({ repository, destroy, enabled: true, ...options });
  return { worker, repository, destroy };
}
describe("durable storage reconciliation lifecycle", () => {
  it.each(["ok", "not found"])("finishes an idempotent provider deletion: %s", async result => {
    const f = fixture([asset], vi.fn(async () => ({ result }))); f.worker.start();
    await vi.waitFor(() => expect(f.repository.finish).toHaveBeenCalledWith(asset, true)); await f.worker.stop();
  });
  it("retains referenced and unknown outcomes without contacting Cloudinary", async () => {
    const f = fixture([{ retained: true }, { blocked: true }]); f.worker.start();
    await vi.waitFor(() => expect(f.repository.claim).toHaveBeenCalledTimes(3)); await f.worker.stop();
    expect(f.destroy).not.toHaveBeenCalled(); expect(f.repository.finish).not.toHaveBeenCalled();
  });
  it("records failure for a provider rejection without clearing the deletion fence", async () => {
    const f = fixture([asset], vi.fn(async () => { throw Error("private provider details"); })); f.worker.start();
    await vi.waitFor(() => expect(f.repository.finish).toHaveBeenCalledWith(asset, false)); await f.worker.stop();
  });
  it("bounds a hung deletion and ignores its late outcome", async () => {
    vi.useFakeTimers();
    try {
      let finish; const f = fixture([asset], vi.fn(() => new Promise(resolve => { finish = resolve; })), { destroyTimeoutMs: 100 });
      f.worker.start(); await vi.advanceTimersByTimeAsync(100); expect(f.repository.finish).toHaveBeenCalledWith(asset, false);
      finish({ result: "ok" }); await vi.advanceTimersByTimeAsync(0); expect(f.repository.finish).toHaveBeenCalledTimes(1); await f.worker.stop();
    } finally { vi.useRealTimers(); }
  });
  it("processes at most ten records per sweep and wakes promptly without overlapping work", async () => {
    const f = fixture(Array.from({ length: 11 }, () => asset)); f.worker.start();
    await vi.waitFor(() => expect(f.repository.finish).toHaveBeenCalledTimes(10));
    f.worker.wake(); await vi.waitFor(() => expect(f.repository.finish).toHaveBeenCalledTimes(11)); await f.worker.stop();
  });
  it("shutdown awaits the admitted deletion and leaves later records for restart", async () => {
    let finish; const f = fixture([asset, asset], vi.fn(() => new Promise(resolve => { finish = resolve; })));
    f.worker.start(); await vi.waitFor(() => expect(f.destroy).toHaveBeenCalledTimes(1));
    let stopped = false; const stopping = f.worker.stop().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false); finish({ result: "ok" }); await stopping;
    expect(f.destroy).toHaveBeenCalledTimes(1); expect(f.repository.finish).toHaveBeenCalledWith(asset, true);
  });
});
