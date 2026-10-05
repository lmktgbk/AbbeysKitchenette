import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({ db: null, evaluate: vi.fn() }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_t, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: {} }));
vi.mock("../src/modules/anomalyDetection/rules/engine.js", () => ({ engine: { evaluate: h.evaluate } }));
vi.mock("../src/modules/anomalyDetection/rules/index.js", () => ({ RULE_REGISTRY: [{ id: "revenue_anomaly", enabled: true, config: {} }] }));
vi.mock("../src/infrastructure/realtime/events.js", () => ({ emitAnomalyCompleted: vi.fn() }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { recordEffects } from "../src/infrastructure/effects/effects.js";
import { createEffectsRepository } from "../src/infrastructure/effects/effects.repository.js";
import { anomalyService } from "../src/modules/anomalyDetection/anomalyDetection.service.js";
import { createAnomalyWorker } from "../src/modules/anomalyDetection/anomalyTriggers.worker.js";
import { automationRepository } from "../src/modules/automation/automation.repository.js";
let fixture, db;
const finding = () => ({ ruleId: "revenue_anomaly", category: "revenue", severity: "high", title: "Fixture", description: "Synthetic finding", actualValue: 500, expectedValue: 100, expectedMin: 0, expectedMax: 200, confidence: 0.9, geminiInsight: null, detectedAt: new Date(), ingredientId: "00000000-0000-4000-8000-000000000001" });
describe.skipIf(process.env.ANOMALY_DB_CHECK !== "1")("PostgreSQL anomaly trigger recovery", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("anomaly_check"); db = h.db = fixture.db; }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  beforeEach(async () => {
    await db.domainEffect.deleteMany(); await db.automationRun.deleteMany(); await db.auditLog.deleteMany(); await db.notification.deleteMany(); await db.anomalyResult.deleteMany();
    anomalyService._lastFired.clear(); h.evaluate.mockReset().mockImplementation(async () => finding());
  });
  it("recovers a mutation trigger through audit delivery without replaying the mutation", async () => {
    await db.$transaction(tx => recordEffects(tx, { audit: { action: "ORDER_COMPLETED", targetType: "order", targetId: "fixture" } }));
    const effects = createEffectsRepository(db); await effects.deliverOne(); await effects.deliverOne();
    expect(await db.automationRun.count()).toBe(1);
    await automationRepository.pauseDisabled({}); expect((await db.automationRun.findFirst()).status).toBe("pending");
    const worker = createAnomalyWorker({ db }); worker.start(); await worker.stop();
    expect((await db.automationRun.findFirst()).status).toBe("succeeded");
    expect(await db.anomalyResult.count()).toBe(1); await effects.deliverOne();
    const notification = await db.notification.findFirst(); expect(await db.anomalyResult.findUnique({ where: { id: notification.referenceId } })).not.toBeNull();
  }, 30000);
  it("concurrent scans publish one finding and use distinct rule context", async () => {
    await Promise.all([anomalyService.runScan(), anomalyService.runScan()]);
    expect(await db.anomalyResult.count()).toBe(1); expect(await db.domainEffect.count()).toBe(2);
    expect(h.evaluate.mock.calls[0][0]).not.toBe(h.evaluate.mock.calls[1][0]);
  }, 30000);
  it("capture failure rolls findings back and leaves the trigger pending for retry", async () => {
    await db.automationRun.create({ data: { runKey: "anomaly:fixture", kind: "anomaly", scheduledAt: new Date(), result: { rules: ["revenue_anomaly"], context: null } } });
    await db.$executeRawUnsafe("ALTER TABLE domain_effects ADD CONSTRAINT fixture_block_effect CHECK (false) NOT VALID");
    try { const worker = createAnomalyWorker({ db }); worker.start(); await worker.stop(); }
    finally { await db.$executeRawUnsafe("ALTER TABLE domain_effects DROP CONSTRAINT fixture_block_effect"); }
    expect(await db.anomalyResult.count()).toBe(0); expect((await db.automationRun.findFirst()).status).toBe("pending");
    await db.automationRun.update({ where: { runKey: "anomaly:fixture" }, data: { nextAttemptAt: new Date(0) } });
    const recovered = createAnomalyWorker({ db }); recovered.start(); await recovered.stop();
    expect(await db.anomalyResult.count()).toBe(1); expect((await db.automationRun.findFirst()).status).toBe("succeeded");
  }, 30000);
  it("expired ownership cannot publish or complete the trigger", async () => {
    const owner = "00000000-0000-4000-8000-000000000001";
    await db.automationRun.create({ data: { runKey: "anomaly:expired", kind: "anomaly", scheduledAt: new Date(), status: "running", owner, leaseExpiresAt: new Date(0) } });
    await expect(anomalyService.runScan(null, null, undefined, { runKey: "anomaly:expired", owner })).rejects.toThrow("ANOMALY_LEASE_LOST");
    expect(await db.anomalyResult.count()).toBe(0); expect(await db.domainEffect.count()).toBe(0);
  }, 30000);
});
