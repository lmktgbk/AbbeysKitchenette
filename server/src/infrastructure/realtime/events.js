/**
 * Realtime Emit Helpers — named invalidation events for mutation paths.
 *
 * WHY it exists: controllers call one named helper per successful mutation
 * instead of touching the hub directly, so topic membership stays defined
 * in exactly one place. Emits are fire-and-forget (a dead socket layer must
 * never fail a sale) and idempotent (clients refetch; duplicates harmless).
 *
 * Topic map (mirrors client realtime/subscriptions.js):
 * - orders/kitchen ... order lifecycle (queues, detail, stats, KDS, POS feed)
 * - inventory/products ... stock-affecting writes (deductions, reversals,
 *   restocks, losses, counts) refresh stock screens + menus elsewhere
 * - shifts ............. drawer open/close (banners, summaries, history)
 * - staff .............. roster writes (admin staff screens)
 * - settings ........... store settings writes (tills re-read live)
 * - audit .............. audit-trail writes (single choke point)
 * - anomaly ............ scan completion (list, stats, badge)
 * - guest:<token> ...... guest order tracking (token-gated, public)
 */

import { broadcast } from "./hub.js";
import prisma from "../../config/prisma.js";

function safeBroadcast(topic, event) {
  try {
    broadcast(topic, event);
  } catch (err) {
    console.warn("[realtime] emit dropped:", topic, err?.message);
  }
}

/** Any order write: queues + detail + stats + kitchen display + POS feed. */
export function emitOrderChanged(orderId) {
  safeBroadcast("orders", { entity: "order", id: orderId ?? null });
  safeBroadcast("kitchen", { entity: "order", id: orderId ?? null });
}

/** Stock-affecting writes: deductions, reversals, restocks, losses, counts. */
export function emitStockChanged() {
  safeBroadcast("inventory", { entity: "stock" });
  safeBroadcast("products", { entity: "menu" });
}

/** Drawer open/close: banners, summaries, history. */
export function emitShiftChanged(shiftId) {
  safeBroadcast("shifts", { entity: "shift", id: shiftId ?? null });
}

/** Staff roster writes: admin staff screens. */
export function emitStaffChanged(staffId) {
  safeBroadcast("staff", { entity: "staff", id: staffId ?? null });
}

/** Store settings writes: tills re-read hours/payments live. */
export function emitSettingsChanged() {
  safeBroadcast("settings", { entity: "settings" });
}

/** Audit trail writes: single choke point (auditLogService.logAction). */
export function emitAuditLogged() {
  safeBroadcast("audit", { entity: "audit-log" });
}

/** Anomaly scan completion: list/stats/badge refresh. */
export function emitAnomalyCompleted(findings) {
  safeBroadcast("anomaly", { entity: "scan", id: findings ?? null });
}

/**
 * Guest order tracking: if the order carries a guest token, fan out to its
 * private topic (token possession authorizes the subscription). Fire-and-
 * forget PK lookup — a miss simply emits nothing.
 */
export function emitGuestForOrder(orderId) {
  if (!orderId) return;
  prisma.order
    .findUnique({ where: { orderId }, select: { guestToken: true } })
    .then((o) => {
      if (o?.guestToken) safeBroadcast(`guest:${o.guestToken}`, { entity: "order", id: orderId });
    })
    .catch((err) => console.warn("[realtime] guest emit dropped:", err?.message));
}
