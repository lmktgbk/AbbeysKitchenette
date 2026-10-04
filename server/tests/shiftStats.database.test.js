import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
const h = vi.hoisted(() => ({ db: null }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_t, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { shiftRepository as shifts } from "../src/modules/shifts/shift.repository.js";
let fixture, db, user, counter = 0;
const from = new Date("2026-09-01T00:00:00Z"), to = new Date("2026-09-30T23:59:59Z");
describe.skipIf(process.env.SHIFT_STATS_DB_CHECK !== "1")("PostgreSQL shift statistics", () => {
  beforeAll(async () => {
    fixture = await isolatedPostgres("shift_stats_check"); db = h.db = fixture.db;
    user = await db.user.create({ data: { name: "Fixture", email: "shift@invalid.example", role: "admin", passwordHash: "unused" } });
  }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  async function session(data = {}) {
    return db.shift.create({ data: { openedBy: user.id, openingCash: 100, openedAt: from, ...data } });
  }
  async function order(shift, data = {}, refund) {
    const row = await db.order.create({ data: { orderNumber: ++counter, orderDate: from, customerName: "Fixture", tableNumber: "1", orderSource: "walk_in", shiftId: shift.shiftId,
      status: "completed", acceptedAt: new Date("2026-09-01T01:00:00Z"), totalAmount: 80, amountPaid: 100, change: 20, ...data } });
    if (refund) await db.paymentRefund.create({ data: { orderId: row.orderId, amount: refund.amount, refundedAt: refund.at ?? new Date("2026-09-01T02:00:00Z"), refundedById: user.id } });
    return row;
  }
  async function reference() {
    const sessions = await db.shift.findMany({ where: { openedAt: { gte: from, lte: to } } });
    const result = { openNow: await db.shift.count({ where: { status: "open" } }), sessions: sessions.length,
      cashSales: 0, cashRefunds: 0, gcashSales: 0, gcashRefunds: 0, mayaSales: 0, mayaRefunds: 0, varianceTotal: 0, offCount: 0 };
    for (const s of sessions) {
      const sales = await shifts.getShiftSales(s.shiftId, s.openedAt, s.closedAt);
      const refunds = await shifts.getShiftCashRefunds(s.shiftId, s.openedAt, s.closedAt);
      for (const key of ["cashSales", "gcashSales", "mayaSales"]) result[key] += sales[key];
      for (const key of ["cashRefunds", "gcashRefunds", "mayaRefunds"]) result[key] += refunds[key];
      if (s.status === "closed") { result.varianceTotal += Number(s.variance ?? 0); if (Number(s.variance ?? 0)) result.offCount++; }
    }
    for (const key of Object.keys(result)) result[key] = Math.round((result[key] + Number.EPSILON) * 100) / 100;
    return result;
  }
  it("returns zero totals for an empty period", async () => {
    expect(await shifts.getStats(from, to)).toEqual(await reference());
  });
  it("preserves paid cancellation, partial refunds, channels and inclusive windows", async () => {
    const closed = await session({ status: "closed", closedAt: new Date("2026-09-01T04:00:00Z"), variance: -12.5 });
    await order(closed, { totalAmount: 50 }, { amount: 30 });
    await order(closed, { status: "cancelled" }, { amount: 80 });
    await order(closed, { paymentMethod: "gcash", amountPaid: 150, change: 0, totalAmount: 125 }, { amount: 25 });
    await order(closed, { paymentMethod: "maya", amountPaid: 250, change: 0 }, { amount: 50 });
    await order(closed, { paymentMethod: "card" });
    await order(closed, { status: "pending", amountPaid: null });
    await order(closed, { status: "cancelled", amountPaid: null }, { amount: 15 });
    await order(closed, { acceptedAt: new Date("2026-09-01T05:00:00Z") }, { amount: 80, at: new Date("2026-09-01T05:00:00Z") });
    await order(closed, { amountPaid: null, totalAmount: 11.25, acceptedAt: from });
    await order(closed, { acceptedAt: closed.closedAt, totalAmount: 0, amountPaid: 0, change: null });
    const other = await db.user.create({ data: { name: "Other", email: "other@invalid.example", role: "cashier", passwordHash: "unused" } });
    await session({ openedBy: other.id, openedAt: new Date("2026-08-01T00:00:00Z") });
    const open = await session({ openedAt: to }); await order(open, { acceptedAt: to, paymentMethod: "cash" });
    const actual = await shifts.getStats(from, to); expect(actual).toEqual(await reference());
    expect(actual).toMatchObject({ cashSales: 251.25, cashRefunds: 110, gcashSales: 150, gcashRefunds: 25, mayaSales: 250, mayaRefunds: 50, varianceTotal: -12.5, offCount: 1, openNow: 2 });
  }, 60000);
  it("uses one statement as history grows and reports measured fixture latency", async () => {
    await db.$executeRaw`INSERT INTO shifts (shift_id, opened_by, opened_at, opening_cash, status, closed_at, variance, updated_at)
      SELECT gen_random_uuid(), ${user.id}::uuid, ${from}, 100, 'closed', ${to}, 0, now() FROM generate_series(1, 300)`;
    const start = performance.now(); const actual = await shifts.getStats(from, to); const elapsedMs = performance.now() - start;
    expect(actual.sessions).toBe(302);
    const query = vi.fn().mockResolvedValue([actual]); h.db = { $queryRaw: query };
    try { await shifts.getStats(from, to); expect(query).toHaveBeenCalledOnce(); } finally { h.db = db; }
    console.log(JSON.stringify({ fixture: "shift-stats", sessions: actual.sessions, statements: 1, elapsedMs: Math.round(elapsedMs) }));
  }, 30000);
});
