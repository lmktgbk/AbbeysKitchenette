// All writes target a generated schema, removed after the checks. Public data is never seeded.
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = h.db[key]; return typeof value === "function" ? value.bind(h.db) : value;
} }) }));
import { automationRepository as repo } from "../src/modules/automation/automation.repository.js";
import { reorderSuggestionsRepository } from "../src/modules/reorderSuggestions/reorderSuggestions.repository.js";
import { wasteReductionRepository } from "../src/modules/wasteReduction/wasteReduction.repository.js";
const schema = `automation_check_${crypto.randomUUID().replaceAll("-", "")}`;
let admin, madeSchema = false, migrationBaseline;
describe.skipIf(process.env.AUTOMATION_DB_CHECK !== "1")("PostgreSQL scheduled run ownership and recovery", () => {
  beforeAll(async () => {
    if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required for isolated checks");
    admin = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
    await admin.connect(); await admin.query("BEGIN");
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`); await admin.query(`SET LOCAL search_path TO "${schema}"`);
      const entries = await readdir("prisma/migrations", { withFileTypes: true });
      for (const name of entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
        if (name === "20261003070000_automation_runs") {
          await admin.query(`INSERT INTO system_settings (id, automation, "updatedAt") VALUES
            (1, '{"dailyReport":{"enabled":true,"frequency":"daily","time":"00:00"}}'::jsonb, clock_timestamp())`);
        }
        const sql = (await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"))
          .replaceAll('"public"', `"${schema}"`).replaceAll("public.", `"${schema}".`)
          .replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
        await admin.query(sql);
      }
      await admin.query("COMMIT"); madeSchema = true;
    } catch (error) { await admin.query("ROLLBACK"); throw error; }
    const url = new URL(process.env.DIRECT_URL); url.searchParams.set("options", `-c search_path=${schema}`);
    h.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 4,
      connectionTimeoutMillis: 10000, statement_timeout: 15000 }, { schema }) });
    const [state] = await h.db.$queryRaw`SELECT current_schema() AS schema`;
    if (state.schema !== schema) throw new Error("Isolated schema not selected; writes refused");
    migrationBaseline = await h.db.automationRun.findMany();
  }, 60000);
  beforeEach(async () => {
    await h.db.automationRun.deleteMany(); await h.db.backgroundLease.deleteMany();
    await h.db.reorderSuggestion.deleteMany(); await h.db.wasteReduction.deleteMany();
    await h.db.forecastJob.deleteMany();
    await h.db.systemSettings.update({ where: { id: 1 }, data: {
      automation: Object.fromEntries(["reorder", "waste", "dailyReport", "forecast", "marketBasket"].map(kind => [kind, { enabled: true }])),
    } });
  }, 30000);
  afterAll(async () => {
    await h.db?.$disconnect();
    if (madeSchema) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.end();
  }, 30000);
  const enqueue = kind => repo.enqueue([{ runKey: `${kind}:2026-10-03`, kind, scheduledAt: new Date("2026-10-03T00:00:00Z") }]);
  const expire = async run => {
    await h.db.automationRun.update({ where: { runKey: run.runKey }, data: { leaseExpiresAt: new Date(0) } });
    await h.db.backgroundLease.updateMany({ data: { expiresAt: new Date(0) } });
  };
  it("concurrent replicas admit one durable run and one owner", async () => {
    await Promise.all(Array.from({ length: 4 }, () => enqueue("reorder")));
    expect(await h.db.automationRun.count()).toBe(1);
    const claims = await Promise.all([repo.claim(), repo.claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const run = claims.find(Boolean); expect(await repo.owns(run)).toBe(true);
    await repo.complete(run); await repo.release(run);
    await enqueue("reorder"); expect(await repo.claim()).toBeNull();
  }, 30000);
  it("reclaims expired advisory ownership and rejects a stale commit", async () => {
    await enqueue("reorder"); const old = await repo.claim(); await expire(old);
    const current = await repo.claim(); expect(current.owner).not.toBe(old.owner);
    await expect(repo.complete(old)).rejects.toThrow("AUTOMATION_LEASE_LOST");
    await repo.release(old); expect((await h.db.backgroundLease.findFirst()).owner).toBe(current.owner);
    expect(await repo.renew(current)).toBe(true);
  }, 30000);
  it("blocks expired email and ML submissions without executing them again", async () => {
    for (const kind of ["dailyReport", "forecast", "marketBasket"]) {
      await enqueue(kind); const run = await repo.claim(); await expire(run);
      expect(await repo.claim()).toBeNull();
      const saved = await h.db.automationRun.findUnique({ where: { runKey: run.runKey } });
      expect(saved.status).toBe("blocked"); expect(saved.lastError).toBe("EXTERNAL_OUTCOME_UNKNOWN");
    }
  }, 30000);
  it("advisory transaction rollback restores both its data and run ownership", async () => {
    await enqueue("reorder"); const run = await repo.claim();
    const ingredient = await h.db.ingredient.upsert({ where: { ingredientName: "Fixture" },
      create: { ingredientName: "Fixture", unit: "pcs" }, update: {} });
    const original = await h.db.reorderSuggestion.create({ data: {
      ingredientId: ingredient.ingredientId, currentStock: 1, suggestedQuantity: 2,
      unit: "pcs", urgency: "low", reasoning: "Fixture", confidence: 0.5,
    } });
    await expect(reorderSuggestionsRepository.saveSuggestions([], { complete: async tx => {
      await repo.complete(run, {}, tx); throw Error("Fixture commit failure");
    } })).rejects.toThrow("Fixture commit failure");
    expect((await h.db.automationRun.findFirst()).status).toBe("running");
    expect((await h.db.reorderSuggestion.findFirst()).id).toBe(original.id);
    await reorderSuggestionsRepository.saveSuggestions([], { complete: tx => repo.complete(run, {}, tx) });
    expect((await h.db.automationRun.findFirst()).status).toBe("succeeded");
    expect(await h.db.reorderSuggestion.count()).toBe(0);
  }, 30000);
  it("waste publication and run outcome share a transaction", async () => {
    await enqueue("waste"); const run = await repo.claim();
    await wasteReductionRepository.saveInsights([], { complete: tx => repo.complete(run, {}, tx) });
    expect((await h.db.automationRun.findFirst()).status).toBe("succeeded");
  }, 30000);
  it("retry delay prevents early work and three failures block the run", async () => {
    await enqueue("reorder");
    for (let attempt = 1; attempt <= 3; attempt++) {
      const run = await repo.claim(); expect(run.attempts).toBe(attempt);
      await repo.fail(run); await repo.release(run);
      expect(await repo.claim()).toBeNull();
      await h.db.automationRun.updateMany({ data: { nextAttemptAt: new Date(0) } });
    }
    expect((await h.db.automationRun.findFirst()).status).toBe("blocked");
  }, 30000);
  it("reconciles submitted ML work from its persisted external job", async () => {
    await enqueue("forecast"); const run = await repo.claim();
    const job = await h.db.forecastJob.create({ data: { status: "running" } });
    await repo.complete(run, { status: "submitted", result: { jobId: job.id } }); await repo.release(run);
    await repo.refreshSubmitted(); expect((await h.db.automationRun.findFirst()).status).toBe("submitted");
    await h.db.forecastJob.update({ where: { id: job.id }, data: { status: "completed" } });
    await repo.refreshSubmitted(); expect((await h.db.automationRun.findFirst()).status).toBe("succeeded");
  }, 30000);
  it("isolated schema enables internal run RLS", async () => {
    const [row] = await h.db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE relnamespace = current_schema()::regnamespace AND relname = 'automation_runs'`;
    expect(row.relrowsecurity).toBe(true);
  });
  it("upgrade records existing schedule uncertainty instead of replaying old mail", () => {
    expect(migrationBaseline).toHaveLength(1);
    expect(migrationBaseline[0]).toMatchObject({ kind: "dailyReport", status: "blocked", lastError: "MIGRATION_HISTORY_UNKNOWN" });
  });
  it("disabling a schedule pauses pending work without changing terminal history", async () => {
    await enqueue("reorder"); await enqueue("waste");
    await repo.pauseDisabled({ reorder: { enabled: true } });
    expect((await h.db.automationRun.findUnique({ where: { runKey: "waste:2026-10-03" } })).status).toBe("blocked");
    expect((await h.db.automationRun.findUnique({ where: { runKey: "reorder:2026-10-03" } })).status).toBe("pending");
    await repo.pauseDisabled({});
    expect(await h.db.automationRun.count({ where: { status: "pending" } })).toBe(0);
  });
  it("claim rechecks current settings even before the next polling refresh", async () => {
    await enqueue("reorder");
    await h.db.systemSettings.update({ where: { id: 1 }, data: { automation: {} } });
    expect(await repo.claim()).toBeNull();
  });
});
