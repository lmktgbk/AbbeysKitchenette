import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
vi.mock("../src/realtime/hub.js", () => ({ broadcast: vi.fn() }));
import { createEffectsWorker } from "../src/services/domainEffects.worker.js";
import { recordEffects } from "../src/services/domainEffects.js";
let worker;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await worker?.stop(); vi.useRealTimers(); });
const repository = () => ({ deliverOne: vi.fn().mockResolvedValue(null), repairAvailability: vi.fn().mockResolvedValue(0), prune: vi.fn().mockResolvedValue() });
it("rejects invalid intents before storing anything", async () => {
  const tx = { domainEffect: { create: vi.fn() } };
  await expect(recordEffects(tx, { notifications: [{ type: "stock_low", title: "Stock", message: "Low", referenceId: "invalid" }] })).rejects.toThrow();
  expect(tx.domainEffect.create).not.toHaveBeenCalled();
});
it("clips user-generated notification descriptions to database bounds and freezes undefined values", async () => {
  const tx = { domainEffect: { create: vi.fn().mockResolvedValue({}) } };
  await recordEffects(tx, { audit: { action: "ORDER_CREATED", details: { missing: undefined, amount: 5 } }, notifications: [{ type: "order_new", title: "Order", message: "x".repeat(501) }] });
  const payload = tx.domainEffect.create.mock.calls[0][0].data.payload;
  expect(payload.notifications[0].message).toHaveLength(500);
  expect(payload.audit.details).toEqual({ amount: 5 });
});
it("skips empty intents", async () => {
  const tx = { domainEffect: { create: vi.fn() } }; await recordEffects(tx, {});
  expect(tx.domainEffect.create).not.toHaveBeenCalled();
});
it("does not split an emoji at the notification clipping boundary", async () => {
  const tx = { domainEffect: { create: vi.fn().mockResolvedValue({}) } };
  await recordEffects(tx, { notifications: [{ type: "order_cancelled", title: "Order", message: `${"x".repeat(498)}😀tail` }] });
  expect(tx.domainEffect.create.mock.calls[0][0].data.payload.notifications[0].message).toBe(`${"x".repeat(498)}…`);
});
it("keeps successful database delivery when socket emission fails", async () => {
  const repo = repository(); repo.deliverOne.mockResolvedValueOnce({ audit: true, notifications: 1 }); repo.repairAvailability.mockResolvedValue(1);
  const emit = vi.fn(() => { throw Error("Socket unavailable"); });
  worker = createEffectsWorker({ repository: repo, emit }); worker.start(); await vi.advanceTimersByTimeAsync(0);
  expect(repo.deliverOne).toHaveBeenCalledTimes(2); expect(repo.repairAvailability).toHaveBeenCalledTimes(1);
});
it("resumes after transient storage failure without an overlapping sweep", async () => {
  const repo = repository(); repo.deliverOne.mockRejectedValueOnce(Error("Database down"));
  worker = createEffectsWorker({ repository: repo, intervalMs: 5000 }); worker.start(); worker.wake();
  await vi.advanceTimersByTimeAsync(0); expect(repo.deliverOne).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000); expect(repo.deliverOne).toHaveBeenCalledTimes(2);
});
it("limits each sweep and stops scheduling after shutdown", async () => {
  const repo = repository(); repo.deliverOne.mockResolvedValue({ deferred: true });
  worker = createEffectsWorker({ repository: repo }); worker.start(); await vi.advanceTimersByTimeAsync(0);
  expect(repo.deliverOne).toHaveBeenCalledTimes(20); await worker.stop();
  await vi.advanceTimersByTimeAsync(10000); expect(repo.deliverOne).toHaveBeenCalledTimes(20);
});
it("drains the in-flight delivery before shutdown completes", async () => {
  const repo = repository(); let release;
  repo.deliverOne.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  worker = createEffectsWorker({ repository: repo }); worker.start();
  let stopped = false; const stopping = worker.stop().then(() => { stopped = true; });
  await vi.advanceTimersByTimeAsync(0); expect(stopped).toBe(false);
  release({ audit: true, notifications: 1 }); await stopping;
  expect(stopped).toBe(true); expect(repo.repairAvailability).not.toHaveBeenCalled();
});
