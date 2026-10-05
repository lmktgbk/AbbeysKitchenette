import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_t, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { resolveAdvisory } from "../src/services/advisoryEffects.js";
import { reorderSuggestionsRepository as reorder } from "../src/modules/reorderSuggestions/reorderSuggestions.repository.js";
import { wasteReductionRepository as waste } from "../src/modules/wasteReduction/wasteReduction.repository.js";
import { automationRepository as automation } from "../src/modules/automation/automation.repository.js";
import { createEffectsRepository } from "../src/infrastructure/effects/effects.repository.js";
let fixture, db, user, ingredient;
describe.skipIf(process.env.REPORT_ML_DB_CHECK !== "1")("PostgreSQL report and ML follow-up recovery", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("report_ml_check"); db = h.db = fixture.db; }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  beforeEach(async () => {
    await db.domainEffect.deleteMany(); await db.auditLog.deleteMany(); await db.notification.deleteMany();
    await db.forecastJob.deleteMany(); await db.mBAJob.deleteMany(); await db.automationRun.deleteMany();
    await db.ingredient.deleteMany(); await db.user.deleteMany();
    user = await db.user.create({ data: { name: "Fixture", email: "fixture@invalid.example", role: "admin", passwordHash: "unused" } });
    ingredient = await db.ingredient.create({ data: { ingredientName: "Beans", unit: "g", minimumThreshold: 2 } });
  }, 20000);
  const suggestion = () => ({ ingredient_id: ingredient.ingredientId, current_stock: 1, unit: "g", suggested_quantity: 10, urgency: "high", reasoning: "Fixture", confidence: 0.8 });
  const insight = () => ({ ingredient_id: ingredient.ingredientId, current_stock: 10, forecasted_weekly_usage: 2, unit: "g", overstock_amount: 8, waste_risk: "high", reasoning: "Fixture", suggestion: "Fixture", confidence: 0.8 });
  async function block(work) {
    await db.$executeRawUnsafe("ALTER TABLE domain_effects ADD CONSTRAINT fixture_block_effect CHECK (false) NOT VALID");
    try { await expect(work()).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("ALTER TABLE domain_effects DROP CONSTRAINT fixture_block_effect"); }
  }
  it.each(["reorder", "waste"])("%s publication rolls back replacement on capture failure", async kind => {
    const publish = kind === "reorder" ? () => reorder.saveSuggestions([suggestion()], undefined, user.id) : () => waste.saveInsights([insight()], undefined, user.id);
    await publish(); const model = kind === "reorder" ? db.reorderSuggestion : db.wasteReduction;
    const before = await model.findMany(); await block(publish); expect(await model.findMany()).toEqual(before);
    expect(await db.domainEffect.count()).toBe(1);
  }, 30000);
  it.each(["reorder", "waste"])("%s resolution has one winner and preserves audit on recovery", async kind => {
    const model = kind === "reorder" ? "reorderSuggestion" : "wasteReduction";
    if (kind === "reorder") await reorder.saveSuggestions([suggestion()], undefined, user.id);
    else await waste.saveInsights([insight()], undefined, user.id);
    const row = await db[model].findFirst();
    await block(() => resolveAdvisory(model, row.id, "accepted", user.id, "FIXTURE_ACCEPTED"));
    expect((await db[model].findFirst()).status).toBe("pending");
    const results = await Promise.allSettled([resolveAdvisory(model, row.id, "accepted", user.id, "FIXTURE_ACCEPTED"), resolveAdvisory(model, row.id, "rejected", user.id, "FIXTURE_REJECTED")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected").reason.statusCode).toBe(409);
    const worker = createEffectsRepository(db); await worker.deliverOne(); await worker.deliverOne();
    expect(await db.auditLog.count()).toBe(2);
  }, 30000);
  it("concurrent generation does not combine pending result batches", async () => {
    await Promise.all([reorder.saveSuggestions([suggestion()], undefined, user.id), reorder.saveSuggestions([{ ...suggestion(), suggested_quantity: 20 }], undefined, user.id)]);
    expect(await db.reorderSuggestion.count()).toBe(1); expect(await db.domainEffect.count()).toBe(2);
  }, 20000);
  it("automation completion rolls back its state if audit capture fails", async () => {
    const owner = "00000000-0000-4000-8000-000000000001";
    const run = await db.automationRun.create({ data: { runKey: "forecast:fixture", kind: "forecast", scheduledAt: new Date(), status: "running", owner, leaseExpiresAt: new Date(Date.now() + 60000) } });
    await block(() => automation.complete({ ...run, owner }, { status: "submitted", result: { jobId: 1 } }));
    expect((await db.automationRun.findFirst()).status).toBe("running");
    await automation.complete({ ...run, owner }, { status: "submitted", result: { jobId: 1 } });
    expect((await db.automationRun.findFirst()).status).toBe("submitted"); expect(await db.domainEffect.count()).toBe(1);
  }, 20000);
  it("Python job transitions and backend delivery share the same durable payload contract", async () => {
    const python = process.env.ML_TEST_PYTHON || (process.platform === "win32" ? resolve("../ml-service/venv/Scripts/python.exe") : "python3");
    const result = await promisify(execFile)(python, [resolve("tests/helpers/checkMlEffects.py"), fixture.schema], { timeout: 60000, env: process.env });
    expect(JSON.parse(result.stdout)).toEqual({ checks: 5, events: 6 });
    const worker = createEffectsRepository(db); for (let i = 0; i < 6; i++) await worker.deliverOne();
    expect(await db.auditLog.count()).toBe(6); expect(await db.domainEffect.count({ where: { state: "delivered" } })).toBe(6);
  }, 90000);
});
