import bcrypt from "bcryptjs";
import { ingredients, products, categories } from "./catalog.js";
import { marker, seedId, at, units, planDay, takeStock, SeedError } from "./plan.js";

const LEGACY_SEED = { marker, planDay };
const adminId = seedId("admin");
const money = (value) => Math.round(value * 100) / 100;
const timestamp = (day, minute) => at(day, `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
const expires = (day, days) => new Date(Date.parse(day) + days * 86400000);

/** Keep inserts below PostgreSQL's bind limit, including large deduction ledgers. */
async function insert(client, model, data, returning = false) {
  const rows = [];
  for (let offset = 0; offset < data.length; offset += 500) {
    const batch = data.slice(offset, offset + 500);
    if (returning) rows.push(...await client[model].createManyAndReturn({ data: batch }));
    else await client[model].createMany({ data: batch });
  }
  return rows;
}

/** Reset only Prisma-owned application tables. No CASCADE reaches other schemas.
 * Catalog creation shares the reset transaction, so setup errors roll back the wipe.
 * Callers must stop the backend and explicitly confirm the destructive operation.
 */
export async function initialize(prisma, tables, email, password, schema = "public") {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema) || !tables.length || tables.some((table) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table))) throw new SeedError("Invalid application table scope");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? "") || (password?.length ?? 0) < 12) throw new SeedError("Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD (at least 12 characters)");
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((table) => `"${schema}"."${table}"`).join(", ")} RESTART IDENTITY`);
    await tx.user.create({ data: { id: adminId, name: "Demo Administrator", email, passwordHash, role: "admin" } });
    const storeHours = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => [day, { enabled: true, open: "16:00", close: "23:59" }]));
    await tx.systemSettings.create({ data: { id: 1, storeHours, automation: {}, acceptedPayments: ["cash", "gcash", "maya"] } });
    for (const [root, subs] of Object.entries(categories)) {
      await tx.category.create({ data: { categoryName: root, subcategories: { create: subs.map((name) => ({ subcategoryName: name })) } } });
    }
    await insert(tx, "ingredient", ingredients.map(([name, unit, threshold]) => ({ ingredientId: seedId(`ingredient:${name}`), ingredientName: name, unit, minimumThreshold: threshold })));
    const subs = await tx.subcategory.findMany();
    for (const [name, sub, description, variants] of products) {
      await tx.product.create({ data: { productId: seedId(`product:${name}`), productName: name, description,
        subcategoryId: subs.find((row) => row.subcategoryName === sub).subcategoryId,
        variants: { create: variants.map(([size, price, recipe]) => ({ sizeName: size, price,
          recipes: { create: recipe.map(([quantity, ingredient]) => ({ ingredientId: seedId(`ingredient:${ingredient}`), quantityNeeded: quantity })) } })) } } });
    }
  }, { timeout: 120000 });
}

/** Resolve current rows once, and refuse extension after catalog edits.
 * Stock is read inside each day's transaction because manual tests may consume it.
 */
export async function loadCatalog(prisma) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin) throw new SeedError("This database has not been initialized with the demo seed");
  const duplicateStock = await prisma.restockBatch.groupBy({ by: ["ingredientId"], where: { quantityLeft: { gt: 0 } }, _count: { _all: true } });
  if (duplicateStock.some((group) => group._count._all > 1)) throw new SeedError("Multiple positive manual batches; reconcile stock before extending the demo");
  const rows = await prisma.product.findMany({ include: { variants: { include: { recipes: true } } } });
  const variants = new Map();
  for (const [name, , , sizes] of products) {
    const product = rows.find((row) => row.productId === seedId(`product:${name}`));
    if (!product || product.isArchived) throw new SeedError(`Seed catalog changed: ${name}`);
    for (const [size, price, recipe] of sizes) {
      const variant = product.variants.find((row) => row.sizeName === size);
      if (!variant || Number(variant.price) !== price || variant.recipes.length !== recipe.length ||
        recipe.some(([quantity, ingredient]) => !variant.recipes.some((r) => r.ingredientId === seedId(`ingredient:${ingredient}`) && Number(r.quantityNeeded) === quantity))) throw new SeedError(`Seed recipe/price changed: ${name}/${size}`);
      variants.set(`${name}|${size}`, { productId: product.productId, variantId: variant.variantId });
    }
  }
  return variants;
}

/** Publish a complete business day atomically: sales, shifts, stock and checkpoint.
 * A failed day has no checkpoint, so --extend safely resumes without duplicates.
 * Purchases cover the day's shortage; this is a demo inventory policy, not forecasting.
 */
export async function writeDay(prisma, day, catalog, seed = LEGACY_SEED) {
  const { marker, planDay } = seed;
  return prisma.$transaction(async (tx) => {
    const shiftId = seedId(`shift:${day}`);
    const checkpoint = await tx.shift.findUnique({ where: { shiftId } });
    if (checkpoint) {
      if (checkpoint.closeNote !== marker) throw new SeedError("Seed definition changed; extension refused");
      return false;
    }
    const orders = planDay(day);
    const counter = await tx.orderCounter.findUnique({ where: { date: new Date(day) } });
    const previous = await tx.order.aggregate({ where: { orderDate: new Date(day) }, _max: { orderNumber: true } });
    let number = Math.max(counter?.counter ?? 0, previous._max.orderNumber ?? 0);
    const cash = orders.filter((o) => o.payment === "cash").reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.quantity * l.price, 0), 0);
    await tx.shift.create({ data: { shiftId, openedBy: adminId, openedAt: at(day, "16:00"), openingCash: 1000,
      status: "closed", closedAt: at(day, "23:59"), closedBy: adminId, expectedCash: 1000 + cash, actualCash: 1000 + cash, variance: 0, closeNote: marker,
      createdAt: at(day, "16:00"), updatedAt: at(day, "23:59") } });
    await insert(tx, "order", orders.map((o) => {
      const total = o.lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
      return { orderId: o.id, orderNumber: ++number, orderDate: new Date(day), customerName: o.customer, tableNumber: o.table,
        orderSource: "walk_in", status: "completed", shiftId, paymentMethod: o.payment,
        referenceNo: o.payment === "cash" ? null : `DEMO-${o.id}`, subtotalAmount: total, totalAmount: total, amountPaid: total, change: 0,
        createdBy: adminId, createdAt: timestamp(day, o.minute), updatedAt: timestamp(day, o.minute + 20),
        acceptedAt: timestamp(day, o.minute + 1), acceptedBy: adminId, preparingAt: timestamp(day, o.minute + 3), preparingBy: adminId,
        completedAt: timestamp(day, o.minute + 20), completedBy: adminId, fulfillmentMinutes: 19, consumptionRecordedAt: timestamp(day, o.minute + 3) };
    }));
    const items = await insert(tx, "orderItem", orders.flatMap((o) => o.lines.map((line) => ({ orderId: o.id,
      ...catalog.get(`${line.name}|${line.size}`), quantity: line.quantity, unitPrice: line.price, subtotal: line.quantity * line.price,
      isPrepared: true, preparedBy: adminId, preparedAt: timestamp(day, o.minute + 18) }))), true);
    // Returned rows are not ordered. Match by order and variant, never array position.
    const itemGroups = new Map();
    for (const item of items) {
      const key = `${item.orderId}|${item.variantId}|${item.quantity}`;
      if (!itemGroups.has(key)) itemGroups.set(key, []);
      itemGroups.get(key).push(item.orderItemId);
    }
    const needs = new Map();
    for (const o of orders) for (const line of o.lines) for (const [quantity, ingredient] of line.recipe) needs.set(ingredient, units((needs.get(ingredient) ?? 0) + quantity * line.quantity));
    const stock = await tx.restockBatch.findMany({ where: { quantityLeft: { gt: 0 } }, orderBy: [{ restockedAt: "asc" }, { restockId: "asc" }] });
    const batches = new Map();
    const adjustments = [];
    for (const row of stock) {
      const batch = { id: row.restockId, ingredientId: row.ingredientId, cost: Number(row.costPerUnit), left: Number(row.quantityLeft) };
      if (!batches.has(row.ingredientId)) batches.set(row.ingredientId, []);
      batches.get(row.ingredientId).push(batch);
      if (row.expiryDate && row.expiryDate < new Date(day)) {
        const loss = await tx.lossRecord.create({ data: { ingredientId: row.ingredientId, declaredById: adminId, lossType: "expiry",
          quantityLost: batch.left, costPerUnit: batch.cost, totalCostLost: money(batch.left * batch.cost), relatedRestockId: batch.id,
          notes: "Demo extension: expired closing inventory", loggedAt: at(day, "15:00") } });
        adjustments.push({ ingredientId: row.ingredientId, adjustedById: adminId, adjustmentType: "loss", quantityBefore: batch.left, quantityChanged: -batch.left, quantityAfter: 0,
          relatedRestockId: batch.id, relatedLossId: loss.lossId, adjustedAt: at(day, "15:00") });
        batch.left = 0;
      }
    }
    const purchases = [];
    for (const [name, , , life, cost] of ingredients) {
      const ingredientId = seedId(`ingredient:${name}`);
      const before = units((batches.get(ingredientId) ?? []).reduce((sum, b) => sum + b.left, 0));
      const shortage = units(Math.max(0, (needs.get(name) ?? 0) - before));
      if (!shortage) continue;
      purchases.push({ ingredientId, restockedById: adminId, quantityAdded: shortage, quantityLeft: shortage, costPerUnit: cost,
        totalCost: money(shortage * cost), expiryDate: expires(day, life), restockedAt: at(day, "15:30"), supplierName: "Demo supplier (estimated)", notes: marker });
      adjustments.push({ ingredientId, adjustedById: adminId, adjustmentType: "restock", quantityBefore: before, quantityChanged: shortage,
        quantityAfter: units(before + shortage), adjustedAt: at(day, "15:30") });
    }
    const bought = await insert(tx, "restockBatch", purchases, true);
    for (const row of bought) {
      if (!batches.has(row.ingredientId)) batches.set(row.ingredientId, []);
      batches.get(row.ingredientId).push({ id: row.restockId, ingredientId: row.ingredientId, cost: Number(row.costPerUnit), left: Number(row.quantityLeft) });
      adjustments.find((a) => a.adjustmentType === "restock" && a.ingredientId === row.ingredientId).relatedRestockId = row.restockId;
    }
    const deductions = [];
    for (const o of orders) for (const line of o.lines) {
      const variant = catalog.get(`${line.name}|${line.size}`);
      const orderItemId = itemGroups.get(`${o.id}|${variant.variantId}|${line.quantity}`).shift();
      for (const [quantity, name] of line.recipe) {
        const ingredientId = seedId(`ingredient:${name}`);
        const pool = batches.get(ingredientId);
        const before = units(pool.reduce((sum, b) => sum + b.left, 0));
        const required = units(quantity * line.quantity);
        for (const allocation of takeStock(pool, required)) deductions.push({ orderId: o.id, orderItemId, ingredientId,
          restockBatchId: allocation.batch.id, quantityDeducted: allocation.quantity, costPerUnit: allocation.batch.cost });
        adjustments.push({ ingredientId, adjustedById: adminId, adjustmentType: "deduction", quantityBefore: before, quantityChanged: -required,
          quantityAfter: units(before - required), relatedOrderId: o.id, adjustedAt: timestamp(day, o.minute + 3) });
      }
    }
    await insert(tx, "orderIngredientDeduction", deductions);
    await insert(tx, "stockAdjustment", adjustments);
    // One set-based update avoids a network round trip for every batch.
    const changed = [...batches.values()].flat();
    if (changed.length) await tx.$executeRawUnsafe(`UPDATE restock_batches AS b SET quantity_left = v.balance FROM (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id integer, balance numeric)) AS v WHERE b.restock_id = v.id`, JSON.stringify(changed.map((b) => ({ id: b.id, balance: b.left }))));
    await insert(tx, "receipt", orders.map((o) => ({ receiptId: seedId(`receipt-row:${o.id}`), orderId: o.id, issuedBy: adminId,
      totalAmount: o.lines.reduce((sum, l) => sum + l.quantity * l.price, 0), issuedAt: timestamp(day, o.minute + 1) })));
    await tx.orderCounter.upsert({ where: { date: new Date(day) }, create: { date: new Date(day), counter: number }, update: { counter: number } });
    return true;
  }, { timeout: 60000 });
}

/** Leave one current positive batch per ingredient; never rewrite exhausted history. */
export async function closingStock(prisma, through, seed = LEGACY_SEED) {
  const { marker } = seed;
  await prisma.$transaction(async (tx) => {
    const stock = await tx.restockBatch.findMany({ where: { quantityLeft: { gt: 0 } } });
    const purchases = [];
    for (const [name, , threshold, life, cost] of ingredients) {
      const ingredientId = seedId(`ingredient:${name}`);
      const current = stock.filter((b) => b.ingredientId === ingredientId);
      if (current.length > 1) throw new SeedError(`Multiple positive batches for ${name}; refusing to merge manual history`);
      if (current.length) continue;
      const maximumPortion = Math.max(...products.flatMap((p) => p[3].flatMap((v) => v[2].filter((r) => r[1] === name).map((r) => r[0]))), 1);
      const quantity = units(Math.max(threshold * 1.5, maximumPortion * 3));
      purchases.push({ ingredientId, restockedById: adminId, quantityAdded: quantity, quantityLeft: quantity, costPerUnit: cost,
        totalCost: money(quantity * cost), expiryDate: expires(through, life), restockedAt: at(through, "23:58"), supplierName: "Demo supplier (estimated)", notes: `${marker}:closing` });
    }
    const rows = await insert(tx, "restockBatch", purchases, true);
    await insert(tx, "stockAdjustment", rows.map((row) => ({ ingredientId: row.ingredientId, adjustedById: adminId,
      adjustmentType: "restock", quantityBefore: 0, quantityChanged: row.quantityAdded, quantityAfter: row.quantityAdded,
      relatedRestockId: row.restockId, adjustedAt: at(through, "23:58"), notes: "Demo closing stock" })));
  }, { timeout: 60000 });
}
