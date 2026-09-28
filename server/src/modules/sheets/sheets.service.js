import crypto from "crypto";
import cron from "node-cron";
import prisma from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { BUSINESS_TZ } from "../../config/time.js";
import { orderRepository } from "../orders/order.repository.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/**
 * Google Sheets live order sync.
 *
 * Every paid order appends one row to the configured sheet; cancellations
 * and refunds append adjustment rows (history is never rewritten). The sale
 * path is never blocked: hooks enqueue post-commit and return immediately,
 * a serialized sender respects the Sheets write quota, and failures stay in
 * SheetSyncLog for the nightly reconciler to backfill.
 *
 * Disabled unless GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY +
 * SHEETS_ORDERS_ID are all set.
 */

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const SHEET_RANGE = "Orders!A:K";
const MIN_GAP_MS = 1100; // ~55 writes/min, under the 60/min quota
const RECONCILE_SCHEDULE = "30 3 * * *"; // 3:30am Manila daily

let accessToken = null;
let tokenExpiresAt = 0;
let sendChain = Promise.resolve();
let reconcilerTask = null;

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const sheetsService = {
  isConfigured() {
    return Boolean(
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        env.GOOGLE_PRIVATE_KEY &&
        env.SHEETS_ORDERS_ID,
    );
  },

  /** Service-account JWT → OAuth access token (cached to expiry-60s). */
  async getAccessToken() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({
        iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        scope: SHEETS_SCOPE,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
    const signature = crypto
      .sign("sha256", Buffer.from(`${header}.${claims}`), privateKey)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claims}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`Google auth failed: ${res.status}`);
    const data = await res.json();
    accessToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
    return accessToken;
  },

  /** One row per paid order — matches the user's header row exactly. */
  buildRow(order) {
    const items = (order.items ?? [])
      .filter((i) => !i.isRemoved && !i.removedAt)
      .map((i) => {
        const name = i.product?.productName ?? "Item";
        const size = i.variant?.sizeName ? ` (${i.variant.sizeName})` : "";
        return `${i.quantity}x ${name}${size}`;
      })
      .join(", ");
    const date =
      order.orderDate instanceof Date
        ? order.orderDate.toISOString().slice(0, 10)
        : String(order.orderDate ?? "").slice(0, 10);
    // Time is its own column: accepted (paid) moment, else created, Manila.
    const stamp = order.acceptedAt ?? order.createdAt ?? null;
    const time = stamp instanceof Date && !Number.isNaN(stamp.getTime())
      ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }).format(stamp)
      : String(order.orderTime ?? "").slice(0, 5) || "-";
    const cashier = order.acceptedByUser?.name ?? order.creator?.name ?? "";
    return [
      `#${order.orderNumber}`,
      date,
      time,
      order.customerName ?? "",
      order.tableNumber ?? "",
      items,
      Number(order.subtotalAmount ?? 0),
      Number(order.discountAmount ?? 0),
      Number(order.totalAmount ?? 0),
      order.paymentMethod ?? "",
      cashier,
    ];
  },

  /** Adjustment row for cancels/refunds/item removals — history preserved, never edited. */
  buildAdjustmentRow(order, kind) {
    const row = this.buildRow(order);
    // NOTE: Items is index 5 (Order #0, Date1, Time2, Customer3, Table4, Items5).
    const tag = kind === "cancelled" ? "CANCELLED" : kind === "adjusted" ? "ADJUSTED" : "REFUNDED";
    row[5] = `${tag} — was: ${row[5]}`;
    return row;
  },

  async appendRow(values) {
    const token = await this.getAccessToken();
    // RAW: values store literally ("00:25" stays "00:25", dates stay text)
    // instead of Sheets reinterpreting them; JSON numbers stay numeric.
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEETS_ORDERS_ID}` +
      `/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=RAW`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [values] }),
    });
    if (res.status === 401) {
      accessToken = null; // force refresh once, then retry
      return this.appendRow(values);
    }
    if (!res.ok) throw new Error(`Sheets append failed: ${res.status}`);
  },

  /** Serialized sender — quota-safe gap between writes, chain never rejects. */
  sendSerialized(task) {
    sendChain = sendChain
      .then(() => task())
      .then(() => new Promise((r) => setTimeout(r, MIN_GAP_MS)))
      .catch(() => new Promise((r) => setTimeout(r, MIN_GAP_MS)));
    return sendChain;
  },

  /**
   * Enqueue a sync — fire-and-forget, never throws into the sale path.
   * Idempotent for "paid" (an already-synced order is skipped); every
   * adjustment event ("cancelled"/"adjusted"/"refunded") gets its own row
   * so history stays append-only.
   */
  enqueue(orderId, kind = "paid") {
    if (!orderId || !this.isConfigured()) return;
    this.sendSerialized(async () => {
      let log;
      if (kind === "paid") {
        const existing = await prisma.sheetSyncLog.findUnique({
          where: { orderId_kind: { orderId, kind } },
        });
        if (existing?.status === "synced") return;
        log =
          existing ??
          (await prisma.sheetSyncLog.create({ data: { orderId, kind } }));
      } else {
        log = await prisma.sheetSyncLog.create({ data: { orderId, kind } });
      }
      try {
        const order = await orderRepository.findById(orderId);
        if (!order) throw new Error("Order not found");
        const values =
          kind === "paid" ? this.buildRow(order) : this.buildAdjustmentRow(order, kind);
        await this.appendRow(values);
        await prisma.sheetSyncLog.update({
          where: { id: log.id },
          data: { status: "synced", syncedAt: new Date(), lastError: null },
        });
      } catch (err) {
        await prisma.sheetSyncLog
          .update({
            where: { id: log.id },
            data: {
              status: "pending",
              attempts: { increment: 1 },
              lastError: String(err?.message ?? err).slice(0, 500),
            },
          })
          .catch(() => {});
      }
    }).catch(() => {});
  },

  /**
   * Nightly reconciler — retries pending rows oldest-first. Audits a
   * summary (never per-order spam). Throws only on total DB failure.
   */
  async reconcile(limit = 200) {
    if (!this.isConfigured()) return { ran: false, reason: "not-configured" };
    const pending = await prisma.sheetSyncLog.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    let synced = 0;
    const failures = [];
    for (const log of pending) {
      try {
        const order = await orderRepository.findById(log.orderId);
        if (!order) throw new Error("Order not found");
        const values =
          log.kind === "paid"
            ? this.buildRow(order)
            : this.buildAdjustmentRow(order, log.kind);
        await this.appendRow(values);
        await prisma.sheetSyncLog.update({
          where: { id: log.id },
          data: { status: "synced", syncedAt: new Date(), lastError: null },
        });
        synced++;
        await new Promise((r) => setTimeout(r, MIN_GAP_MS));
      } catch (err) {
        const msg = String(err?.message ?? err).slice(0, 500);
        failures.push(`${log.orderId.slice(0, 8)}: ${msg}`);
        await prisma.sheetSyncLog
          .update({
            where: { id: log.id },
            data: { status: "pending", attempts: { increment: 1 }, lastError: msg },
          })
          .catch(() => {});
      }
    }
    await auditLogService
      .logAction({
        action: ACTIONS.SHEET_SYNC_RECONCILED,
        targetType: "report",
        details: { checked: pending.length, synced, failed: failures.length, failures: failures.slice(0, 10) },
      })
      .catch(() => {});
    return { ran: true, checked: pending.length, synced, failed: failures.length };
  },

  startReconciler() {
    if (!this.isConfigured() || reconcilerTask) return;
    if (!cron.validate(RECONCILE_SCHEDULE)) {
      console.error("[sheets] Invalid reconcile schedule:", RECONCILE_SCHEDULE);
      return;
    }
    reconcilerTask = cron.schedule(
      RECONCILE_SCHEDULE,
      () => this.reconcile().catch((err) => console.error("[sheets] reconcile dropped:", err?.message)),
      { timezone: BUSINESS_TZ },
    );
    console.log(`[sheets] Reconciler started: ${RECONCILE_SCHEDULE} (${BUSINESS_TZ})`);
  },
};
