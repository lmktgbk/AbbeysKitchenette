import "dotenv/config";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── helpers ──
const uuid = () => crypto.randomUUID();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => Math.random() * (max - min) + min;
function pickWeighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const pht = (dateStr, hh, mm) => new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+08:00`);

const NAMES = ["Juan Dela Cruz", "Maria Santos", "Jose Reyes", "Anna Lim", "Pedro Garcia",
  "Rose Bautista", "Mark Torres", "Joy Mendoza", "Carlo Villanueva", "Bea Fernando",
  "Daniel Ramos", "Sheila Aquino", "Ryan Castro", "Mia Gonzales", "Leo Navarro",
  "Patricia Sy", "Jerome Dizon", "Camille Tan", "Aaron Magsaysay", "Grace Padilla",
  "Rica Villanueva", "Jolo Mercado", "Bianca Salazar", "Kyle Miranda", "Faye Rodriguez",
  "Enrico Cruz", "Liza Ramos", "Paolo Gutierrez", "Nica Fernandez", "Jomari Reyes"];
const TABLES = ["Gazebo", "Lanai", "Dome", "Tent 1", "Tent 2", "Tent 5", "Indoor", "Lanai 1", "Takeout"];
const CANCEL_REASONS = ["Changed mind", "Customer left", "Duplicate order", "Taking too long"];

// PH holidays (1.3x demand). Regular + major special non-working days.
const HOLIDAYS = new Set([
  "2025-01-01", "2025-01-29", "2025-04-09", "2025-04-17", "2025-04-18", "2025-04-19",
  "2025-05-01", "2025-06-12", "2025-08-25", "2025-11-01", "2025-11-02", "2025-11-30",
  "2025-12-08", "2025-12-24", "2025-12-25", "2025-12-30", "2025-12-31",
  "2026-01-01", "2026-02-17", "2026-04-02", "2026-04-03", "2026-04-04",
  "2026-04-09", "2026-05-01", "2026-06-12", "2026-08-31",
]);

// ── Real slips: [date, table, customer|null, payment, [[qty, product, size]...]] ──
// Prices come from the menu (DB). "Cold" 130→Cold 16oz, 150→Cold 22oz.
export const REAL = [
  ["2026-09-20", "Gazebo", null, "cash", [[1, "Creamy Carbonara", "Regular"], [1, "Matcha Blueberry Latte", "22oz"], [2, "Spanish Latte", "Cold 22oz"], [1, "Grilled Liempo", "Regular"], [1, "Burger Steak", "Regular"], [1, "Caramel Macchiato", "Cold 22oz"], [1, "American Breakfast", "Regular"]]],
  ["2026-09-20", "Lanai", null, "maya", [[1, "Caesar Salad", "Regular"], [1, "Clubhouse", "Regular"], [2, "Spanish Latte", "Cold 22oz"]]],
  ["2026-09-20", "Dome", null, "cash", [[1, "Biscoff Latte", "22oz"], [1, "Cookies & Cream Frappe", "22oz"], [1, "Matcha Strawberry Latte", "22oz"], [1, "Toyomansi Porkchop", "Regular"], [1, "Creamy Carbonara", "Regular"], [1, "Homemade Tocilog", "Regular"], [1, "Abbey's Signature Tapsilog", "Regular"]]],
  ["2026-09-20", "Lanai", null, "cash", [[1, "Caramel Macchiato", "Cold 22oz"], [2, "Salted Caramel Frappe", "22oz"], [1, "Nachos", "Regular"], [1, "Baked Penne", "Regular"], [1, "Meatball Spaghetti", "Regular"]]],
  ["2026-09-20", "Tent 2", null, "cash", [[1, "White Chocolate", "Cold 22oz"], [1, "Caramel Macchiato", "Cold 22oz"]]],
  ["2026-09-20", "Tent 2", null, "cash", [[1, "Biscoff Latte", "22oz"], [1, "Matcha Strawberry Latte", "22oz"], [1, "Cheesy Tuna Pesto", "Regular"]]],
  ["2026-09-20", "Lanai", null, "cash", [[1, "Choco Hazelnut", "Cold 22oz"]]],
  ["2026-09-20", "Takeout", null, "cash", [[1, "Biscoff Latte", "22oz"], [1, "White Chocolate Frappe", "22oz"], [1, "Salted Caramel Frappe", "22oz"], [1, "Creamy Carbonara", "Regular"], [1, "Baked Penne", "Regular"]]],
  ["2026-09-20", "Lanai", null, "cash", [[1, "Mini Donuts", "Choco"], [1, "Spanish Latte", "Cold 22oz"], [1, "Strawberry Fruit Tea", "22oz"], [1, "Salted Caramel Frappe", "22oz"]]],
  ["2026-09-20", "Indoor", null, "maya", [[2, "Chicken Ala King", "Regular"], [1, "Abbey's Signature Tapsilog", "Regular"], [1, "Abbey's Bibimbowl", "Regular"], [2, "Abbey's Signature Fried Chicken", "Regular"]]],
  ["2026-09-20", "Tent 1", null, "maya", [[1, "Spanish Latte", "Cold 22oz"], [1, "White Chocolate", "Cold 22oz"], [1, "Biscoff Latte", "22oz"], [1, "Red Velvet Frappe", "22oz"], [1, "Street Food Platter", "Regular"], [2, "Cheesy Tuna Pesto", "Regular"]]],
  ["2026-09-20", "Tent 2", null, "cash", [[1, "Grilled Liempo", "Regular"], [1, "Abbey's Signature Tapsilog", "Regular"], [1, "Caesar Salad", "Regular"], [1, "Spanish Latte", "Cold 22oz"]]],
  ["2026-09-20", "Indoor", null, "cash", [[1, "Crispy Kare Kare", "Solo"], [1, "Grilled Liempo", "Regular"], [2, "Abbey's Signature Tapsilog", "Regular"], [1, "Fried Rice", "Regular"]]],
  ["2026-09-20", "Takeout", "Ate Maye", "cash", [[1, "Pork Butterfly Steak", "Solo"], [1, "Toyomansi Porkchop", "Regular"], [1, "Abbey's Bibimbowl", "Regular"], [1, "Blueberry Fruit Tea", "22oz"], [1, "Strawberry Fruit Tea", "22oz"], [1, "Strawberry Probiotic", "22oz"]]],
  ["2026-09-20", "Gazebo", null, "cash", [[1, "Strawberry Fruit Tea", "16oz"], [1, "White Chocolate", "Hot 16oz"]]],
  ["2026-09-20", "Takeout", "Sir Ken", "maya", [[1, "Chicken Neck", "Regular"], [1, "Extra Rice", "Regular"], [1, "Crispy Pork Sinigang", "Solo"]]],
  ["2026-09-20", "Indoor", null, "maya", [[1, "Katsu Bowl", "Regular"], [1, "Chicken Ala King", "Regular"], [1, "Spanish Latte", "Hot 16oz"], [1, "Caramel Macchiato", "Hot 16oz"]]],
  ["2026-09-20", "Tent 2", null, "cash", [[1, "Biscoff Latte", "22oz"], [1, "Matcha Latte", "22oz"], [1, "Crispy Kare Kare", "Solo"], [1, "Cheesy Tuna Pesto", "Regular"]]],
  ["2026-09-13", "Tent 2", null, "cash", [[1, "Matcha Frappe", "16oz"], [1, "Mocha Frappe", "16oz"]]],
  ["2026-09-13", "Indoor", null, "cash", [[1, "Matcha Frappe", "22oz"], [1, "Matcha Latte", "22oz"], [1, "Clubhouse", "Regular"], [1, "Chicken Ala King", "Regular"]]],
  ["2026-09-13", "Indoor", null, "maya", [[1, "Abbey's Bibimbowl", "Regular"], [1, "Chicken Ala King", "Regular"], [1, "Caramel Macchiato", "Hot 16oz"], [1, "Caramel Latte & Vanilla Cream", "Hot 16oz"], [1, "French Fries", "Sour Cream"]]],
  ["2026-09-13", "Lanai", null, "cash", [[2, "Spanish Latte", "Cold 16oz"], [1, "Grilled Liempo", "Regular"], [1, "Abbey's Signature Fried Chicken", "Regular"], [1, "French Fries", "Cheese"]]],
  ["2026-09-13", "Indoor", null, "cash", [[1, "Vanilla Latte", "Hot 16oz"], [1, "Caramel Latte & Vanilla Cream", "Hot 16oz"], [1, "French Fries", "BBQ"]]],
  ["2026-09-13", "Indoor", null, "cash", [[1, "Chicken Ala King", "Regular"], [1, "Katsu Bowl", "Regular"], [1, "Spanish Latte", "Hot 16oz"], [1, "Caramel Macchiato", "Hot 16oz"]]],
  ["2026-09-13", "Takeout", null, "cash", [[1, "White Chocolate", "Hot 16oz"], [1, "Choco Frappe", "16oz"], [1, "Matcha Salted Caramel", "16oz"]]],
  ["2026-09-13", "Lanai 1", null, "cash", [[1, "Matcha Strawberry Latte", "16oz"], [1, "Choco Frappe", "16oz"], [3, "Matcha Latte", "16oz"], [1, "Spanish Latte", "Hot 16oz"], [1, "Sausilog", "Regular"], [1, "French Fries", "BBQ"]]],
  ["2026-09-13", "Takeout", null, "maya", [[1, "Choco Salted Cream Cheese Frappe", "22oz"], [1, "Matcha Frappe", "22oz"], [1, "Caramel Latte & Vanilla Cream", "Cold 22oz"], [1, "Caramel Macchiato", "Cold 22oz"], [1, "Red Velvet Frappe", "22oz"], [1, "Mango Frappe", "22oz"], [1, "French Fries", "BBQ"], [1, "French Fries", "Sour Cream"], [1, "Choco Salted Cream Cheese Frappe", "22oz"], [1, "Katsu Bowl", "Regular"]]],
  ["2026-09-06", "Gazebo", null, "maya", [[1, "Caramel Macchiato", "Hot 16oz"], [1, "Salted Caramel Frappe", "22oz"], [1, "Creamy Carbonara", "Regular"], [1, "Biscoff Latte", "22oz"]]],
  ["2026-09-19", "Lanai", null, "cash", [[1, "Chicken BBQ", "Regular"], [1, "Caesar Salad", "Regular"], [1, "Biscoff Latte", "22oz"], [1, "Cookies & Cream Frappe", "22oz"], [1, "Matcha Strawberry Latte", "22oz"]]],
  ["2026-09-19", "Lanai", null, "cash", [[1, "French Fries", "Cheese"]]],
  ["2026-09-19", "Tent 1", null, "cash", [[1, "Spanish Latte", "Cold 22oz"], [1, "White Chocolate", "Cold 22oz"]]],
  ["2026-09-19", "Takeout", null, "cash", [[1, "White Chocolate", "Cold 22oz"], [1, "Spanish Latte", "Hot 16oz"]]],
  ["2026-09-19", "Lanai", null, "cash", [[1, "Choco Frappe", "16oz"], [1, "Matcha Frappe", "22oz"], [1, "Mini Donuts", "Choco"]]],
  ["2026-09-19", "Gazebo", null, "cash", [[1, "Spanish Latte", "Cold 22oz"], [1, "White Chocolate Frappe", "22oz"], [1, "Caramel Macchiato", "Cold 22oz"], [1, "Mango Probiotic", "22oz"], [1, "French Fries", "Cheese"]]],
  ["2026-09-19", "Tent 5", null, "cash", [[2, "Choco Frappe", "22oz"], [1, "Caramel Macchiato", "Cold 22oz"], [1, "Creamy Carbonara", "Regular"]]],
  ["2026-09-19", "Gazebo", null, "cash", [[1, "Mango Frappe", "22oz"], [1, "Choco Frappe", "22oz"], [3, "Matcha Frappe", "22oz"]]],
  ["2026-09-18", "Tent 5", null, "cash", [[1, "Grilled Liempo", "Regular"], [1, "Crispy Kare Kare", "Solo"], [1, "Clubhouse", "Regular"], [1, "Matcha Latte", "22oz"], [1, "Creamy Carbonara", "Regular"]]],
];

async function main() {
  const t0 = Date.now();
  console.log("Phase 3: orders Jan 2025 - Sep 2026 + FIFO replay...");

  // ── Load catalog ──
  const variants = await prisma.productVariant.findMany({
    include: { product: { select: { productId: true, productName: true } }, recipes: true },
  });
  const V = new Map(); // "product||size" -> {variantId, productId, price, recipes}
  for (const v of variants) {
    V.set(`${v.product.productName}||${v.sizeName}`, {
      variantId: v.variantId, productId: v.product.productId,
      price: Number(v.price),
      recipes: v.recipes.map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.quantityNeeded) })),
    });
  }
  console.log(`  catalog: ${V.size} variants`);
  for (const [d, , , , items] of REAL) {
    void d;
    for (const [, pn, sz] of items) {
      if (!V.has(`${pn}||${sz}`)) throw new Error(`Real slip references unknown variant: ${pn} || ${sz}`);
    }
  }
  console.log("  ✓ all real-slip variants resolve");

  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  const cashiers = users.filter((u) => u.role === "cashier" || u.role === "admin").map((u) => u.id);
  const kitchens = users.filter((u) => u.role === "kitchen").map((u) => u.id);
  const admins = users.filter((u) => u.role === "admin").map((u) => u.id);
  const ADMIN = admins[0] ?? cashiers[0];

  const ingCost = new Map((await prisma.ingredient.findMany()).map(() => []));
  const batches = await prisma.restockBatch.findMany({ orderBy: { restockId: "asc" } });
  const inv = new Map(); // ingredientId -> [{batchId, left, cost}]
  const baseCost = new Map();
  for (const b of batches) {
    if (!inv.has(b.ingredientId)) inv.set(b.ingredientId, []);
    inv.get(b.ingredientId).push({ batchId: b.restockId, left: Number(b.quantityLeft), cost: Number(b.costPerUnit) });
    if (!baseCost.has(b.ingredientId)) baseCost.set(b.ingredientId, Number(b.costPerUnit));
  }
  void ingCost;

  // Demand pools (variant keys) — top sellers first
  const ALLK = [...V.keys()];
  const FOOD_RE = /Regular$|Solo$|Sharing \(2-3\)$|Ham$|Bacon$|Tuna$|Cheese$|BBQ$|Sour Cream$|Ube$|Choco$|Matcha$|White Choco$/;
  const RESALE_RE = /Resale|Coke in Can|Pineapple Juice/;
  const poolFood = ALLK.filter((k) => FOOD_RE.test(k));
  const poolDrink = ALLK.filter((k) => !FOOD_RE.test(k) && !RESALE_RE.test(k));
  const poolResale = ALLK.filter((k) => RESALE_RE.test(k));
  const TOP = ["Spanish Latte||Cold 22oz", "Spanish Latte||Cold 16oz", "Biscoff Latte||22oz",
    "Matcha Strawberry Latte||22oz", "Matcha Latte||22oz", "Creamy Carbonara||Regular",
    "Chicken Ala King||Regular", "Abbey's Signature Tapsilog||Regular", "French Fries||Cheese",
    "Caramel Macchiato||Cold 22oz", "Katsu Bowl||Regular", "Cheesy Tuna Pesto||Regular",
    "Grilled Liempo||Regular", "White Chocolate||Cold 22oz", "Choco Frappe||22oz",
    "Matcha Frappe||22oz", "Abbey's Bibimbowl||Regular"].filter((k) => V.has(k));
  const PAIR = {
    drink: ["Creamy Carbonara||Regular", "Abbey's Signature Tapsilog||Regular", "French Fries||Cheese", "Cheesy Tuna Pesto||Regular", "Katsu Bowl||Regular", "Chicken Ala King||Regular", "Clubhouse||Regular", "Nachos||Regular", "Mini Donuts||Choco"],
    food: ["Spanish Latte||Cold 22oz", "Biscoff Latte||22oz", "Matcha Strawberry Latte||22oz", "Matcha Latte||22oz", "Caramel Macchiato||Cold 22oz", "Strawberry Fruit Tea||22oz", "Mango Probiotic||22oz", "Choco Frappe||22oz"],
  };
  const isDrink = (k) => poolDrink.includes(k);

  // Order assembly buffers (chronological insert later)
  const orderRows = [], itemRows = [], cancelRows = [], receiptRows = [];
  const counterMap = new Map();
  const manifest = [];
  let nCancelled = 0, nCompleted = 0;

  function buildOrder(dateStr, hh, mm, table, customer, payment, lines, forceStatus) {
    // lines: [[qty, "prod||size"]...]
    let total = 0;
    const items = lines.map(([qty, key]) => {
      const v = V.get(key);
      const sub = Math.round(v.price * qty * 100) / 100;
      total = Math.round((total + sub) * 100) / 100;
      return { productId: v.productId, variantId: v.variantId, quantity: qty, unitPrice: v.price, subtotal: sub, key };
    });
    const status = forceStatus ?? (Math.random() < 0.02 ? "cancelled" : "completed");
    const n = (counterMap.get(dateStr) ?? 0) + 1;
    counterMap.set(dateStr, n);
    const d = new Date(dateStr + "T00:00:00+08:00");
    const orderNumber = Number(`${String(d.getFullYear() % 100).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(n).padStart(3, "0")}`);
    const orderId = uuid();
    const createdAt = pht(dateStr, hh, mm);    const acceptedAt = new Date(createdAt.getTime() + randInt(1, 3) * 60000);
    const cashier = pick(cashiers), kitchen = pick(kitchens);
    const row = {
      orderId, orderNumber, orderDate: new Date(dateStr + "T00:00:00Z"), customerName: customer ?? pick(NAMES),
      tableNumber: table, orderSource: Math.random() < 0.85 ? "walk_in" : "online",
      status, acceptedAt, acceptedBy: cashier,
      preparingAt: status === "cancelled" ? null : new Date(acceptedAt.getTime() + randInt(1, 2) * 60000),
      preparingBy: status === "cancelled" ? null : kitchen,
      completedAt: null, completedBy: null, fulfillmentMinutes: null,
      subtotalAmount: total, discountType: "none", discountPercent: 0, discountAmount: 0,
      paymentMethod: payment, referenceNo: payment === "cash" ? null : `REF${orderNumber}${randInt(100, 999)}`,
      totalAmount: total, amountPaid: total, change: 0,
      guestToken: null, createdBy: cashier, createdAt,
    };
    if (row.orderSource === "online") row.guestToken = uuid();
    if (status === "completed") {
      const done = new Date(row.preparingAt.getTime() + randInt(3, 12) * 60000);
      row.completedAt = done; row.completedBy = kitchen;
      row.fulfillmentMinutes = Math.max(1, Math.round((done.getTime() - createdAt.getTime()) / 60000));
      nCompleted++;
    } else nCancelled++;
    orderRows.push(row);
    for (const it of items) {
      itemRows.push({
        orderId, productId: it.productId, variantId: it.variantId, quantity: it.quantity,
        unitPrice: it.unitPrice, subtotal: it.subtotal, discountType: "none", discountPercent: 0,
        discountAmount: 0, isPrepared: status === "completed", preparedBy: status === "completed" ? kitchen : null,
        preparedAt: status === "completed" ? row.completedAt : null,
      });
    }
    if (status === "cancelled") {
      cancelRows.push({ orderId, cancelledBy: cashier, reason: pick(CANCEL_REASONS), cancelledAt: acceptedAt });
    } else {
      receiptRows.push({ receiptId: uuid(), orderId, issuedBy: kitchen, totalAmount: total, issuedAt: row.completedAt });
    }
    return { orderId, orderNumber, n: items.length, total, status };
  }

  // ── Real slips first (fixed times 16:00-23:00 + manifest) ──
  console.log("  building 37 real orders...");
  const usedSlots = new Map();
  REAL.forEach(([date, table, cust, pay, items], idx) => {
    const k = date;
    const slot = (usedSlots.get(k) ?? 0);
    usedSlots.set(k, slot + 1);
    const hh = 16 + (slot % 8), mm = (slot * 13) % 60;
    const lines = items.map(([q, pn, sz]) => [q, `${pn}||${sz}`]);
    const r = buildOrder(date, hh, mm, table, cust, pay, lines, "completed");
    manifest.push(`slip#${idx + 1} ${date} ${table} -> order ${r.orderNumber} (${r.n} lines, P${r.total})`);
  });

  // ── Dummy orders Jan 2025 - Sep 2026 ──
  console.log("  generating dummy orders...");
  const START = new Date("2025-01-01T00:00:00+08:00");
  const END = new Date("2026-09-28T00:00:00+08:00");
  const HOURS = [16, 17, 18, 19, 20, 21, 22, 23];
  const HW = [5, 8, 12, 14, 13, 10, 7, 4];
  // Real-slip dates already have coverage; still generate base dummy there (counters merge).
  for (let d = new Date(START); d <= END; d = addDays(d, 1)) {
    const ds = dstr(d);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6;
    let n = weekend ? randInt(18, 30) : randInt(10, 20);
    if (HOLIDAYS.has(ds)) n = Math.round(n * 1.3);
    const m = d.getMonth();
    if (m === 11) n = Math.round(n * 1.25);
    else if (m >= 5 && m <= 7) n = Math.max(6, Math.round(n * 0.9));
    else if (m >= 2 && m <= 4) n = Math.round(n * 1.1);
    // gentle growth 2025 -> 2026
    const growth = 1 + 0.25 * ((d - START) / (END - START));
    n = Math.max(5, Math.round(n * growth));
    for (let i = 0; i < n; i++) {
      const hh = pickWeighted(HOURS, HW), mm = randInt(0, 59);
      const nItems = pickWeighted([1, 2, 3, 4], [40, 35, 20, 5]);
      const rv = Math.random();
      const first = rv < 0.03 && poolResale.length ? pick(poolResale)
        : Math.random() < 0.12 && TOP.length ? pick(TOP)
        : Math.random() < 0.68 ? pick(poolDrink) : pick(poolFood);
      const lines = [[Math.random() < 0.85 ? 1 : 2, first]];
      const seen = new Set([first]);
      for (let j = 1; j < nItems; j++) {
        let cand;
        if (Math.random() < 0.55) {
          const pool = isDrink(first) ? PAIR.drink : PAIR.food;
          cand = pick(pool.filter((k) => !seen.has(k) && V.has(k)));
          if (!cand) cand = pick(isDrink(first) ? poolFood : poolDrink);
        } else {
          cand = Math.random() < 0.12 && TOP.length ? pick(TOP) : pick(V.keys() ? [...V.keys()] : []);
        }
        if (!cand || seen.has(cand)) continue;
        seen.add(cand);
        lines.push([Math.random() < 0.9 ? 1 : 2, cand]);
      }
      const pay = Math.random() < 0.7 ? "cash" : Math.random() < 0.83 ? "maya" : "gcash";
      buildOrder(ds, hh, mm, pick(TABLES), null, pay, lines);
    }
  }
  console.log(`  orders: ${orderRows.length} (${nCompleted} completed, ${nCancelled} cancelled), items: ${itemRows.length}`);

  // Sort chronologically for FIFO replay + numbering per day
  const orderIdx = new Map(orderRows.map((o, i) => [o.orderId, i]));
  orderRows.sort((a, b) => a.createdAt - b.createdAt || a.orderId.localeCompare(b.orderId));

  // ── Bulk inserts ──
  async function bulk(model, rows, size = 4000, label = "") {
    for (let i = 0; i < rows.length; i += size) {
      await model.createMany({ data: rows.slice(i, i + size), skipDuplicates: true });
    }
    console.log(`  ✓ ${label || model}: ${rows.length}`);
  }
  await bulk(prisma.order, orderRows.map(({ guestToken, ...o }) => ({ ...o, guestToken })), 4000, "orders");
  await bulk(prisma.orderItem, itemRows, 4000, "order_items");
  if (cancelRows.length) await bulk(prisma.orderCancellation, cancelRows, 4000, "cancellations");
  if (receiptRows.length) await bulk(prisma.receipt, receiptRows, 4000, "receipts");
  await bulk(prisma.orderCounter, [...counterMap.entries()].map(([date, counter]) => ({ date: new Date(date + "T00:00:00Z"), counter })), 4000, "counters");

  // ── Scheduled restocks (bulk): every 14 days per ingredient, Jan 2025 - Sep 2026 ──
  console.log("  generating scheduled restocks...");
  const AUTO_QTY = new Map();
  for (const [ingId, list] of inv) AUTO_QTY.set(ingId, list[0].left);
  const schedRows = [];
  for (const [ingId, qty] of AUTO_QTY) {
    const cost0 = baseCost.get(ingId) ?? 0.1;
    for (let d = new Date("2025-01-15T00:00:00+08:00"); d <= END; d = addDays(d, 14)) {
      const cost = Math.round(cost0 * randFloat(0.95, 1.05) * 10000) / 10000;
      schedRows.push({
        ingredientId: ingId, restockedById: ADMIN, quantityAdded: qty, quantityLeft: qty,
        costPerUnit: cost, totalCost: Math.round(qty * cost * 100) / 100,
        supplierName: "Scheduled Restock (Seed)", notes: "Seed schedule",
        restockedAt: new Date(d),
      });
    }
  }
  for (let i = 0; i < schedRows.length; i += 4000) {
    await prisma.restockBatch.createMany({ data: schedRows.slice(i, i + 4000), skipDuplicates: true });
  }
  const sched = await prisma.restockBatch.findMany({
    where: { supplierName: "Scheduled Restock (Seed)" }, orderBy: [{ ingredientId: "asc" }, { restockedAt: "asc" }],
  });
  for (const b of sched) {
    inv.get(b.ingredientId).push({ batchId: b.restockId, left: Number(b.quantityLeft), cost: Number(b.costPerUnit) });
  }
  // chronological within each ingredient (opening batch 2025-01-01 stays first)
  for (const list of inv.values()) list.sort((a, b) => (a.batchId > b.batchId ? 1 : -1));
  console.log(`  ✓ ${sched.length} scheduled restock batches`);

  // ── FIFO replay (in-memory; rare top-up fallback) ──
  console.log("  FIFO replay...");
  const variantRecipes = new Map(variants.map((v) => [v.variantId, v.recipes.map((r) => ({ ingredientId: r.ingredientId, qty: Number(r.quantityNeeded) }) )]));
  const itemsByOrder = new Map();
  for (const it of itemRows) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId).push(it);
  }
  const deductions = [], adjustments = [];
  const topUps = []; // rare fallback batches (bulk-created after replay)
  let topUpSeq = 0;

  function ensureStock(ingId, need, at) {
    let have = inv.get(ingId).reduce((s, b) => s + b.left, 0);
    if (have >= need) return;
    const qty = (AUTO_QTY.get(ingId) ?? need) * 4; // 8-week top-up: keeps fallbacks rare
    const cost = Math.round((baseCost.get(ingId) ?? 0.1) * randFloat(0.95, 1.05) * 10000) / 10000;
    const nb = { batchId: `TOPUP${++topUpSeq}`, left: qty, cost, at, qtyAdded: qty, isNew: true };
    inv.get(ingId).push(nb);
  }

  for (const o of orderRows) {
    if (o.status !== "completed") continue;
    const need = new Map();
    for (const it of itemsByOrder.get(o.orderId) ?? []) {
      for (const r of variantRecipes.get(it.variantId) ?? []) {
        need.set(r.ingredientId, (need.get(r.ingredientId) ?? 0) + r.qty * it.quantity);
      }
    }
    for (const [ingId, qty] of need) ensureStock(ingId, qty, o.createdAt);
    for (const [ingId, qty] of need) {
      let rem = qty;
      const before = inv.get(ingId).reduce((s, b) => s + b.left, 0);
      for (const b of inv.get(ingId)) {
        if (rem <= 0) break;
        if (b.left <= 0) continue;
        const take = Math.min(rem, b.left);
        b.left = Math.round((b.left - take) * 1000) / 1000;
        rem = Math.round((rem - take) * 1000) / 1000;
        if (!b.isNew) {
          deductions.push({ orderId: o.orderId, ingredientId: ingId, restockBatchId: b.batchId, quantityDeducted: take, costPerUnit: b.cost });
        } else {
          b.restockId = null; // resolved at insert
          deductions.push({ orderId: o.orderId, ingredientId: ingId, restockBatchId: b.batchId, quantityDeducted: take, costPerUnit: b.cost });
        }
      }
      adjustments.push({
        ingredientId: ingId, adjustedById: o.createdBy, adjustmentType: "deduction",
        quantityBefore: before, quantityChanged: -qty, quantityAfter: before - qty,
        relatedOrderId: o.orderId,
      });
    }
  }
  // Insert top-up batches, remap string ids
  const newOnes = [];
  for (const [ingId, list] of inv) for (const b of list) if (b.isNew) newOnes.push({ ing: ingId, b });
  newOnes.sort((a, b) => a.b.at - b.b.at);
  const idRemap = new Map();
  if (newOnes.length) {
    await prisma.restockBatch.createMany({
      data: newOnes.map(({ ing, b }) => ({
        ingredientId: ing, restockedById: ADMIN, quantityAdded: b.qtyAdded, quantityLeft: b.qtyAdded,
        costPerUnit: b.cost, totalCost: Math.round(b.qtyAdded * b.cost * 100) / 100,
        supplierName: "Top-up (Seed)", notes: "Seed replay top-up", restockedAt: b.at,
      })),
      skipDuplicates: true,
    });
    const created = await prisma.restockBatch.findMany({
      where: { supplierName: "Top-up (Seed)" }, orderBy: { restockId: "asc" },
    });
    // match in order (same order as inserted)
    newOnes.forEach(({ b }, i) => {
      idRemap.set(b.batchId, created[i].restockId);
      b.batchId = created[i].restockId;
      b.isNew = false;
    });
    console.log(`  ✓ ${newOnes.length} top-up batches`);
  }
  void topUps;
  for (const d of deductions) {
    if (typeof d.restockBatchId === "string") d.restockBatchId = idRemap.get(d.restockBatchId);
  }
  await bulk(prisma.orderIngredientDeduction, deductions, 4000, "deductions");
  await bulk(prisma.stockAdjustment, adjustments, 4000, "adjustments");

  // Sync quantityLeft of all batches (chunked transactions)
  console.log("  syncing batch quantities...");
  const allB = [];
  for (const list of inv.values()) for (const b of list) if (typeof b.batchId === "number") allB.push(b);
  let synced = 0;
  for (let i = 0; i < allB.length; i += 50) {
    await prisma.$transaction(allB.slice(i, i + 50).map((b) =>
      prisma.restockBatch.update({ where: { restockId: b.batchId }, data: { quantityLeft: Math.max(0, Math.round(b.left * 1000) / 1000) } })
    ));
    synced += Math.min(50, allB.length - i);
    if (synced % 500 === 0) console.log(`  ... ${synced}/${allB.length}`);
  }
  console.log(`  ✓ ${synced} batches synced`);

  // ── Monthly losses ──
  const ingIds = [...inv.keys()];
  const losses = [];
  const mStart = new Date("2025-01-01T00:00:00+08:00");
  for (let m = 0; m < 21; m++) {
    const k = randInt(3, 5);
    for (let j = 0; j < k; j++) {
      const ing = pick(ingIds);
      const q = randInt(5, 60);
      const c = baseCost.get(ing) ?? 0.1;
      const day = addDays(mStart, m * 30 + randInt(1, 28));
      losses.push({
        ingredientId: ing, declaredById: pick(kitchens.length ? kitchens : cashiers),
        lossType: pick(["spoilage", "spillage", "expiry", "other"]),
        quantityLost: q, costPerUnit: c, totalCostLost: Math.round(q * c * 100) / 100,
        notes: "Seeded loss", loggedAt: day,
      });
    }
  }
  if (losses.length) await bulk(prisma.lossRecord, losses, 4000, "losses");

  console.log("\n── Real-slip manifest ──");
  for (const line of manifest) console.log("  " + line);
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (process.argv[1]?.endsWith("03-orders.js")) {
  main()
    .catch((e) => { console.error("Orders seed failed:", e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
