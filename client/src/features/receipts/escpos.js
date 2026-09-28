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
const SIZE_DOUBLE = [0x1d, 0x21, 0x11];

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

function enc(str) {
  return Array.from(new TextEncoder().encode(escposText(str)));
}

function divider(cols) {
  return enc(`${"-".repeat(cols)}\n`);
}

function centered(str) {
  return [...ALIGN_CENTER, ...enc(`${str}\n`), ...ALIGN_LEFT];
}

function row(left, right, cols) {
  const l = escposText(left);
  const r = escposText(right);
  const gap = Math.max(1, cols - l.length - r.length);
  return enc(`${l}${" ".repeat(gap)}${r}\n`);
}

function peso(n) {
  return `P${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function discountTag(order) {
  if (!order?.discount_type || order.discount_type === "none") return null;
  if (order.discount_type === "senior") return "Senior 20%";
  if (order.discount_type === "pwd") return "PWD 20%";
  if (order.discount_type === "mixed") return "Mixed";
  if (Number(order.discount_percent) > 0) return `Promo ${order.discount_percent}%`;
  if (Number(order.discount_amount) > 0) return `Promo P${Number(order.discount_amount).toFixed(2)}`;
  return "Promo";
}

/** GS v 0 raster bitmap (m=0, normal) for the B/W logo. */
export function rasterCommand(raster) {
  const { width, height, data } = raster;
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;
  return [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...data];
}

function orderLines(order, store, cols) {
  const out = [];
  const dt = order.created_at ? new Date(order.created_at) : new Date();
  const dateStr = dt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const cashier = order.accepted_by?.name || order.creator_name || "-";
  const method = (order.payment_method || "cash").toUpperCase();
  const num = order.order_number != null ? `#${order.order_number}` : "";
  const src = order.order_source === "online" ? "Online" : "Walk-in";

  out.push(...centered(store?.name || "Abbey's Kitchenette"));
  if (store?.address) out.push(...centered(store.address.slice(0, cols)));
  if (store?.phone) out.push(...centered(store.phone.slice(0, cols)));
  out.push(...centered("*** NOT AN OFFICIAL RECEIPT ***"));
  out.push(...divider(cols));
  out.push(...row(`Order ${num}`.trim(), src, cols));
  // Date + table on one row when they fit, else split for 32-col paper.
  const table = `Table ${order.table_number ?? "-"}`;
  if (dateStr.length + table.length + 1 <= cols) {
    out.push(...row(dateStr, table, cols));
  } else {
    out.push(...enc(`${dateStr}\n`));
    out.push(...enc(`${table}\n`));
  }
  out.push(...enc(`Cashier: ${String(cashier).slice(0, cols - 9)}\n`));
  out.push(...enc(`Customer: ${String(order.customer_name ?? "-").slice(0, cols - 10)}\n`));
  out.push(...enc(`${method}${order.reference_no ? ` ${order.reference_no}` : ""}\n`.slice(0, cols + 1)));
  out.push(...divider(cols));

  for (const item of (order.items ?? []).filter((i) => !i.is_removed)) {
    const name = `${item.product_name ?? "Item"}${item.size_name ? ` (${item.size_name})` : ""} x${item.quantity}`;
    const price = peso(item.subtotal);
    if (name.length + price.length + 1 <= cols) {
      out.push(...row(name, price, cols));
    } else {
      // Wrap name first, price right-aligned on its own row for 58mm.
      out.push(...enc(`${name.slice(0, cols)}\n`));
      if (name.length > cols) out.push(...enc(`${name.slice(cols, cols * 2)}\n`));
      out.push(...row("", price, cols));
    }
    out.push(...row(`@ ${peso(item.unit_price)}`, "", cols));
  }
  out.push(...divider(cols));

  out.push(...row("Subtotal", peso(order.subtotal_amount ?? order.total_amount), cols));
  const tag = discountTag(order);
  if (tag) {
    const label = `Discount ${tag}`.slice(0, cols - 10);
    out.push(...row(label, `-${peso(order.discount_amount)}`, cols));
  }
  out.push(...BOLD_ON, ...SIZE_DOUBLE, ...enc(`Total ${peso(order.total_amount)}\n`), ...SIZE_NORMAL, ...BOLD_OFF);
  if (order.amount_paid != null) out.push(...row("Paid", peso(order.amount_paid), cols));
  if (order.change != null) out.push(...row("Change", peso(order.change), cols));
  out.push(...divider(cols));
  out.push(...centered("Thank you for dining with us!"));
  out.push(...centered("This serves as your order slip."));
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
  const out = [...INIT, ...ALIGN_LEFT, ...SIZE_NORMAL];
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
