import { receiptMoney, receiptDate, receiptDiscount } from "./receiptFormat";
import { orderNumberLabel } from "../../lib/orderNumber";

/**
 * ESC/POS byte builder for 58mm thermal printers (GOOJPRT JP-58H).
 *
 * 58mm roll → 384 dots printable → 32 text columns in Font A.
 * 80mm roll → 576 dots → 48 columns (kept so the same code covers both).
 * No cutter on the JP-58H (manual tear) so jobs end with a feed margin.
 */

const INIT = [0x1b, 0x40];
const ALIGN_LEFT = [0x1b, 0x61, 0x00];
const ALIGN_CENTER = [0x1b, 0x61, 0x01];
const BOLD_ON = [0x1b, 0x45, 0x01];
const BOLD_OFF = [0x1b, 0x45, 0x00];
const SIZE_NORMAL = [0x1d, 0x21, 0x00];
const SIZE_TALL = [0x1d, 0x21, 0x01];

/** Selects the configured paper’s text width; unrecognized sizes use the 58mm default. */
export function columnsForPaper(paperSize) {
  return paperSize === "80mm" ? 48 : 32;
}

/** Cheap ESC/POS firmware speaks ASCII — transliterate receipt symbols. */
export function escposText(str) {
  return String(str ?? "")
    .replace(/₱/g, "P")
    .replace(/×/g, "x")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

/** Encodes the ASCII-compatible text returned by escposText into command bytes. */
function enc(str) {
  return Array.from(new TextEncoder().encode(escposText(str)));
}

/** Creates one full-width separator without changing printer alignment. */
function divider(cols) {
  return enc(`${"-".repeat(cols)}\n`);
}

/** Centers one line, then restores left alignment for subsequent receipt content. */
function centered(str) {
  return [...ALIGN_CENTER, ...enc(`${str}\n`), ...ALIGN_LEFT];
}

/** Wrap every character rather than truncating long names, references or customer details. */
function wrapped(value, width) {
  const text = escposText(value).replace(/\s+/g, " ").trim();
  const lines = [];
  let remaining = text;
  while (remaining.length > width) {
    const space = remaining.lastIndexOf(" ", width);
    const cut = space > 0 ? space : width;
    lines.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  lines.push(remaining);
  return lines;
}

/** Reserve the amount column; excess label text continues below without overlapping it. */
function row(left, right, cols) {
  const r = escposText(right);
  if (r.length >= cols) return enc([...wrapped(left, cols), ...wrapped(r, cols)].join("\n") + "\n");
  const lines = wrapped(left, Math.max(1, cols - r.length - 1));
  return enc(lines.map((line, index) => index === 0
    ? `${line}${" ".repeat(cols - line.length - r.length)}${r}` : line).join("\n") + "\n");
}

const peso = value => receiptMoney(value, "P");

/** GS v 0 raster bitmap (m=0, normal) for the B/W logo. */
export function rasterCommand(raster) {
  const { width, height, data } = raster;
  // GS v 0 encodes row width in bytes and height in dots, each as little-endian low/high bytes.
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;
  return [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...data];
}

/** Formats saved order data without recomputing settlements; removed items are excluded. */
function orderLines(order, store, cols) {
  const out = [];
  const line = value => out.push(...enc(wrapped(value, cols).join("\n") + "\n"));
  const center = value => wrapped(value, cols).forEach(text => out.push(...centered(text)));
  out.push(...BOLD_ON);
  center(store?.name || "Abbey's Kitchenette");
  out.push(...BOLD_OFF);
  if (store?.address) center(store.address);
  if (store?.phone) center(store.phone);
  center("NOT AN OFFICIAL RECEIPT");
  out.push(...divider(cols));
  out.push(...row(`Order ${orderNumberLabel(order.order_number)}`, order.order_source === "online" ? "Online" : "Walk-in", cols));
  line(receiptDate(order.created_at));
  line(`Cashier: ${order.accepted_by?.name || order.creator_name || "-"}`);
  line(`Customer: ${order.customer_name || "Walk-in"}`);
  line(`Table: ${order.table_number ?? "-"}`);
  out.push(...divider(cols), ...BOLD_ON, ...row("ITEM", "AMOUNT", cols), ...BOLD_OFF);
  for (const item of (order.items ?? []).filter(item => !item.is_removed)) {
    out.push(...enc("\n"), ...BOLD_ON, ...row(`${item.quantity} x ${item.product_name ?? "Item"}`, peso(item.subtotal), cols), ...BOLD_OFF);
    line(`  ${item.size_name ? `${item.size_name} - ` : ""}${peso(item.unit_price)} each`);
    if (Number(item.discount_amount) > 0) out.push(...row(receiptDiscount(item) || "Item discount", `-${peso(item.discount_amount)}`, cols));
  }
  out.push(...divider(cols), ...row("Subtotal", peso(order.subtotal_amount ?? order.total_amount), cols));
  const tag = receiptDiscount(order);
  if (tag || Number(order.discount_amount) > 0) {
    out.push(...row("Total discounts", `-${peso(order.discount_amount)}`, cols));
    if (tag) line(tag);
    const ids = [order.senior_id_no, order.pwd_id_no].filter(Boolean).join(" / ") || order.discount_id_no;
    if (ids) line(`ID ${ids}`);
  }
  // Double height only: double-width totals can overflow the narrow 32-column paper.
  out.push(...BOLD_ON, ...SIZE_TALL, ...row("TOTAL", peso(order.total_amount), cols), ...SIZE_NORMAL, ...BOLD_OFF, ...divider(cols));
  line(`Payment: ${(order.payment_method || "cash").toUpperCase()}`);
  if (order.reference_no) line(`Reference: ${order.reference_no}`);
  if (order.amount_paid != null) out.push(...row("Amount received", peso(order.amount_paid), cols));
  if (order.change != null) out.push(...row("Change", peso(order.change), cols));
  if (Number(order.refund?.amount) > 0) out.push(...row("Refunded", peso(order.refund.amount), cols));
  out.push(...divider(cols));
  center("Thank you for dining with us!");
  center("This serves as your order slip.");
  return out;
}

/**
 * Build a complete ESC/POS job for the receipt payload
 * ({ order, store }) returned by GET /orders/:id/receipt.
 */
export function buildReceiptBytes(payload, { paperSize = "58mm", logoRaster = null, includeLogo = true } = {}) {
  const cols = columnsForPaper(paperSize);
  const order = payload?.order;
  if (!order) return new Uint8Array(INIT);
  const out = [...INIT, 0x1b, 0x4d, 0x00, ...ALIGN_LEFT, ...SIZE_NORMAL];
  if (includeLogo && logoRaster) {
    out.push(...ALIGN_CENTER, ...rasterCommand(logoRaster), ...enc("\n"), ...ALIGN_LEFT);
  }
  out.push(...orderLines(order, payload.store, cols));
  // Manual-tear margin: feed so the last line clears the cutter bar.
  out.push(0x1b, 0x64, 0x04);
  return new Uint8Array(out);
}

/** Offline sample for the POS Test Print button (no order needed). */
export function buildSampleBytes({ paperSize = "58mm", logoRaster = null, includeLogo = true } = {}) {
  return buildReceiptBytes(
    {
      store: { name: "Abbey's Kitchenette", address: "Test print", phone: "58mm OK" },
      order: {
        order_number: 0,
        order_source: "walk-in",
        created_at: new Date().toISOString(),
        table_number: "-",
        customer_name: "Test",
        payment_method: "cash",
        items: [{ product_name: "Sample Item", size_name: null, quantity: 1, unit_price: 100, subtotal: 100 }],
        subtotal_amount: 100,
        total_amount: 100,
        amount_paid: 100,
        change: 0,
      },
    },
    { paperSize, logoRaster, includeLogo },
  );
}
