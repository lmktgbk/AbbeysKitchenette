// Opt-in checks create and remove only a generated schema; never write public application tables.
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
vi.mock("../src/config/env.js", () => ({ env: { GOOGLE_SERVICE_ACCOUNT_EMAIL: "fixture@example.invalid", GOOGLE_PRIVATE_KEY: "fixture-no-network", SHEETS_ORDERS_ID: "fixture-sheet" } }));
import { sheetsRepository } from "../src/modules/sheets/sheets.repository.js";
import { recordSheetEvent } from "../src/modules/sheets/sheets.outbox.js";
const schema = `sheets_check_${crypto.randomUUID().replaceAll("-", "")}`, orderId = crypto.randomUUID();
let admin, madeSchema = false;
describe.skipIf(process.env.SHEETS_DB_CHECK !== "1")("PostgreSQL Sheets outbox and replica leases", () => {
  beforeAll(async () => {
    if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required for isolated checks");
    admin = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
    await admin.connect(); await admin.query("BEGIN");
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`); await admin.query(`SET LOCAL search_path TO "${schema}"`);
      const entries = await readdir("prisma/migrations", { withFileTypes: true });
      for (const name of entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
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
    if (state.schema !== schema) throw new Error("Isolated schema not selected; all writes refused");
  }, 60000);
  beforeEach(async () => {
    await h.db.sheetSyncLog.deleteMany(); await h.db.sheetSyncDestination.deleteMany(); await h.db.backgroundLease.deleteMany(); await h.db.order.deleteMany();
    await h.db.order.create({ data: { orderId, orderNumber: 1, orderDate: new Date("2026-10-03T00:00:00Z"),
      customerName: "Fixture", tableNumber: "1", orderSource: "walk_in", status: "accepted", totalAmount: 100 } });
  }, 30000);
  afterAll(async () => {
    await h.db?.$disconnect();
    if (madeSchema) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.end();
  }, 30000);
  const record = (kind = "paid", itemId) => h.db.$transaction(tx => recordSheetEvent(tx, orderId, kind, itemId));
  it("concurrent replay creates one frozen event", async () => {
    await Promise.all(Array.from({ length: 4 }, () => record()));
    expect(await h.db.sheetSyncLog.count()).toBe(1);
    const event = await h.db.sheetSyncLog.findFirst(); expect(event.payload.values[8]).toBe(100);
    await h.db.order.update({ where: { orderId }, data: { totalAmount: 20 } });
    expect((await h.db.sheetSyncLog.findFirst()).payload.values[8]).toBe(100);
  }, 30000);
  it("business rollback removes the event with the order change", async () => {
    await expect(h.db.$transaction(async tx => {
      await tx.order.update({ where: { orderId }, data: { totalAmount: 20 } });
      await recordSheetEvent(tx, orderId, "adjusted", 1); throw new Error("Fixture rollback");
    })).rejects.toThrow("Fixture rollback");
    expect(await h.db.sheetSyncLog.count()).toBe(0);
    expect(Number((await h.db.order.findUnique({ where: { orderId } })).totalAmount)).toBe(100);
  }, 30000);
  it("two adjustments remain distinct and same-event replay stays unique", async () => {
    await record("adjusted", 1); await record("adjusted", 2); await record("adjusted", 1);
    expect(await h.db.sheetSyncLog.count()).toBe(2);
  }, 30000);
  it("two replicas can own only one sender and reserve a row once", async () => {
    await record(); const results = await Promise.all([sheetsRepository.claim(), sheetsRepository.claim()]);
    expect(results.filter(Boolean)).toHaveLength(1); const event = results.find(Boolean);
    await sheetsRepository.initialize(event.spreadsheetId, 1001);
    const assigned = await Promise.all([sheetsRepository.reserve(event), sheetsRepository.reserve(event)]);
    expect(assigned).toEqual([1001, 1001]);
    expect((await h.db.sheetSyncDestination.findFirst()).nextRow).toBe(1002);
    expect(await sheetsRepository.finish(event, { status: "synced" })).toBe(1);
    await sheetsRepository.release(event);
  }, 30000);
  it("expired ownership recovers the same reserved row and rejects stale acknowledgements", async () => {
    await record(); const previous = await sheetsRepository.claim();
    await sheetsRepository.initialize(previous.spreadsheetId, 1001); await sheetsRepository.reserve(previous);
    await h.db.sheetSyncLog.update({ where: { id: previous.id }, data: { leaseExpiresAt: new Date(0) } });
    await h.db.backgroundLease.updateMany({ data: { expiresAt: new Date(0) } });
    const current = await sheetsRepository.claim(); expect(current.owner).not.toBe(previous.owner);
    expect(await sheetsRepository.reserve(current)).toBe(1001);
    expect(await sheetsRepository.finish(previous, { status: "synced" })).toBe(0);
    expect(await sheetsRepository.finish(current, { status: "synced" })).toBe(1);
    await sheetsRepository.release(previous); expect((await h.db.backgroundLease.findFirst()).owner).toBe(current.owner);
    await sheetsRepository.release(current);
  }, 30000);
  it("retry timestamps and sender cooldown block premature work", async () => {
    await record(); const event = await sheetsRepository.claim();
    await sheetsRepository.finish(event, { status: "pending", code: "SHEETS_HTTP_429", delayMs: 60000 });
    await sheetsRepository.release(event, 60000);
    expect(await sheetsRepository.claim()).toBeNull();
  }, 30000);
  it("new internal tables have row-level security enabled", async () => {
    const states = await h.db.$queryRaw`SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = current_schema()::regnamespace
      AND relname IN ('sheet_sync_log', 'sheet_sync_destinations', 'background_leases')`;
    expect(states).toHaveLength(3); expect(states.every(state => state.relrowsecurity)).toBe(true);
  });
  it("header recovery requeues only saved events blocked by the layout check", async () => {
    await record();
    const event = await h.db.sheetSyncLog.findFirst();
    await h.db.sheetSyncLog.update({ where: { id: event.id }, data: { status: "blocked", attempts: 1, lastError: "SHEETS_EVENT_COLUMN_OCCUPIED" } });
    await record("adjusted", 1);
    await h.db.sheetSyncLog.updateMany({ where: { kind: "adjusted" }, data: { status: "blocked", lastError: "SHEETS_ROW_CONFLICT" } });
    await record("adjusted", 2);
    await h.db.sheetSyncLog.updateMany({ where: { eventKey: `adjusted:${orderId}:2` }, data: { status: "blocked", lastError: "SHEETS_EVENT_COLUMN_OCCUPIED", payload: null } });
    expect(await sheetsRepository.retryHeaderBlocked()).toBe(1);
    const saved = await h.db.sheetSyncLog.findUnique({ where: { id: event.id } });
    expect(saved.status).toBe("pending"); expect(saved.attempts).toBe(0);
    expect(saved.eventId).toBe(event.eventId); expect(saved.payload).toEqual(event.payload);
    expect(await h.db.sheetSyncLog.count({ where: { status: "blocked" } })).toBe(2);
  });
});
