import { createHash } from "node:crypto";
import { ingredients, products, categories } from "./catalog.js";
import { receipts } from "./receipts.js";

export const VERSION = "demo-v1";
// Only our own validation messages may be shown; database errors may contain secrets.
export class SeedError extends Error {}
export const START = "2025-01-01";
export const fingerprint = createHash("sha256").update(JSON.stringify({ ingredients, products, receipts })).digest("hex");
export const marker = `${VERSION}:${fingerprint}`;
export const units = (value) => Math.round(Number(value) * 1000) / 1000;

/** Stable UUIDs distinguish seed rows from manually created records. */
export function seedId(key) {
  const hex = createHash("sha256").update(`${VERSION}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Dates are business-calendar strings; UTC arithmetic avoids device timezone drift. */
export function dates(from, through) {
  const valid = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
  if (!valid(from) || !valid(through) || from > through) throw new SeedError("Invalid or reversed date range");
  const result = [];
  for (let day = new Date(from); day <= new Date(through); day.setUTCDate(day.getUTCDate() + 1)) result.push(day.toISOString().slice(0, 10));
  return result;
}

export const at = (day, time) => new Date(`${day}T${time}:00+08:00`);

/** Fail before database writes when the catalog or a receipt cannot be resolved. */
export function validateCatalog() {
  const names = new Set(ingredients.map(([name]) => name));
  if (names.size !== ingredients.length) throw new SeedError("Duplicate ingredient");
  const seen = new Set();
  for (const [name, category, , variants] of products) {
    if (seen.has(name.toLowerCase())) throw new SeedError(`Duplicate product: ${name}`);
    seen.add(name.toLowerCase());
    if (!Object.values(categories).flat().includes(category)) throw new SeedError(`Unknown category: ${category}`);
    for (const [size, price, recipe] of variants) {
      if (!(price > 0) || !recipe.length) throw new SeedError(`Invalid variant: ${name}/${size}`);
      const recipeNames = new Set();
      for (const [quantity, ingredient] of recipe) {
        if (!names.has(ingredient) || !(quantity > 0) || recipeNames.has(ingredient)) throw new SeedError(`Invalid recipe: ${name}/${size}/${ingredient}`);
        recipeNames.add(ingredient);
      }
    }
  }
  for (const [, , , , lines] of receipts) for (const [, name, size] of lines) {
    if (!products.find(([n]) => n === name)?.[3].some(([s]) => s === size)) throw new SeedError(`Unmapped receipt: ${name}/${size}`);
  }
}

// Receipt popularity is an assumption for simulation, not a measured daily demand rate.
const observed = new Map();
for (const [, , , , lines] of receipts) for (const [quantity, name, size] of lines) {
  const key = `${name}|${size}`;
  observed.set(key, (observed.get(key) ?? 0) + quantity);
}
const variants = products.flatMap(([name, category, , sizes]) => sizes.map(([size, price, recipe]) => ({
  name, category, size, price, recipe, weight: 1 + (observed.get(`${name}|${size}`) ?? 0),
})));
const drinks = variants.filter((v) => categories.Beverages.includes(v.category));
const foods = variants.filter((v) => categories.Food.includes(v.category));

/** Each day's own PRNG makes incremental extensions identical to a single long run. */
function randomFor(day) {
  let state = createHash("sha256").update(`${VERSION}:${day}`).digest().readUInt32LE();
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(pool, random) {
  let target = random() * pool.reduce((sum, variant) => sum + variant.weight, 0);
  return pool.find((variant) => (target -= variant.weight) < 0) ?? pool.at(-1);
}

/** Generate plausible baskets with weekday variation, noise and occasional quantities >1.
 * Food/drink pairing supports MBA demonstrations without making every basket identical.
 * Actual receipt samples are appended, never presented as a full day's observed sales.
 */
export function planDay(day) {
  const random = randomFor(day);
  const weekday = new Date(day).getUTCDay();
  const multiplier = [1.3, 0.85, 0.9, 1, 1.05, 1.2, 1.4][weekday];
  const count = Math.round(30 * multiplier * (0.8 + random() * 0.4));
  const orders = [];
  for (let i = 0; i < count; i++) {
    const first = pick(random() < 0.6 ? drinks : foods, random);
    const chosen = [first];
    if (random() < 0.65) chosen.push(pick(drinks.includes(first) ? foods : drinks, random));
    if (random() < 0.15) chosen.push(pick(variants, random));
    const lines = new Map();
    for (const variant of chosen) {
      const key = `${variant.name}|${variant.size}`;
      const quantity = (lines.get(key)?.quantity ?? 0) + (random() < 0.12 ? 2 : 1);
      lines.set(key, { ...variant, quantity });
    }
    orders.push({ id: seedId(`order:${day}:${i}`), source: "synthetic", customer: `Demo guest ${i + 1}`,
      table: `Table ${1 + Math.floor(random() * 8)}`, payment: random() < 0.75 ? "cash" : random() < 0.5 ? "maya" : "gcash",
      minute: 16 * 60 + Math.floor(random() * 390), lines: [...lines.values()] });
  }
  receipts.forEach(([date, table, customer, payment, lines], index) => {
    if (date !== day) return;
    orders.push({ id: seedId(`receipt:${index}`), source: "receipt", customer: `Receipt sample ${index + 1}${customer ? ` (${customer})` : ""}`,
      table, payment, minute: 16 * 60 + index * 5,
      lines: lines.map(([quantity, name, size]) => ({ ...variants.find((v) => v.name === name && v.size === size), quantity })) });
  });
  return orders.sort((a, b) => a.minute - b.minute);
}

/** Three decimal places match the stock columns; no negative balances are tolerated. */
export function takeStock(batches, quantity) {
  let remaining = units(quantity);
  const allocations = [];
  for (const batch of batches) {
    const take = units(Math.min(batch.left, remaining));
    if (take <= 0) continue;
    batch.left = units(batch.left - take);
    remaining = units(remaining - take);
    allocations.push({ batch, quantity: take });
    if (!remaining) break;
  }
  if (remaining) throw new SeedError(`Insufficient seeded stock: ${remaining}`);
  return allocations;
}
