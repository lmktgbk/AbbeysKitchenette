import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { BUSINESS_TZ } from "../../config/time.js";

export const sheetsConfigured = () => Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.SHEETS_ORDERS_ID);
const businessClock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BUSINESS_TZ });

/** Frozen state at the business commit; the worker must never re-read mutable orders. */
export function buildSheetRow(order, kind = "paid") {
  const items = (order.items || []).filter(item => !item.removedAt && !item.isRemoved).map(item =>
    `${item.quantity}x ${item.product?.productName || "Item"}${item.variant?.sizeName ? ` (${item.variant.sizeName})` : ""}`,
  ).join(", ");
  const stamp = order.acceptedAt || order.createdAt;
  const time = stamp instanceof Date && Number.isFinite(stamp.getTime())
    ? businessClock.format(stamp)
    : String(order.orderTime || "-").slice(0, 5);
  const date = order.orderDate instanceof Date ? order.orderDate.toISOString().slice(0, 10) : String(order.orderDate || "").slice(0, 10);
  const label = kind === "paid" ? items : `${kind.toUpperCase()} - was: ${items}`;
  return [`#${order.orderNumber}`, date, time, order.customerName || "", order.tableNumber || "", label,
    Number(order.subtotalAmount || 0), Number(order.discountAmount || 0), Number(order.totalAmount || 0),
    order.paymentMethod || "", order.acceptedByUser?.name || order.creator?.name || ""];
}

/** Save one immutable delivery snapshot in the caller's business transaction; disabled Sheets is a no-op. */
export async function recordSheetEvent(tx, orderId, kind, itemId) {
  if (!sheetsConfigured()) return;
  if (!["paid", "adjusted", "cancelled"].includes(kind) || (kind === "adjusted" && !Number.isInteger(itemId))) throw new Error("Invalid sheet event identity");
  const order = await tx.order.findUnique({
    where: { orderId },
    select: { orderNumber: true, orderDate: true, createdAt: true, acceptedAt: true, customerName: true, tableNumber: true,
      subtotalAmount: true, discountAmount: true, totalAmount: true, paymentMethod: true,
      creator: { select: { name: true } }, acceptedByUser: { select: { name: true } },
      items: { where: { removedAt: null }, orderBy: { orderItemId: "asc" }, select: {
        quantity: true, product: { select: { productName: true } }, variant: { select: { sizeName: true } },
      } },
    },
  });
  if (!order) throw new Error("Sheet event order is missing");
  const eventId = randomUUID();
  // Business event identity, not the random delivery UUID, prevents duplicate
  // intent. Each item adjustment has its own key; retries reuse the saved snapshot.
  await tx.sheetSyncLog.createMany({
    data: { orderId, kind, eventId, eventKey: `${kind}:${orderId}${kind === "adjusted" ? `:${itemId}` : ""}`,
      spreadsheetId: env.SHEETS_ORDERS_ID, payload: { version: 1, values: [...buildSheetRow(order, kind), eventId] } },
    skipDuplicates: true,
  });
}
