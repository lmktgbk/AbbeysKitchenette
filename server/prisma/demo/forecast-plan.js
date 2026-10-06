import { createHash } from "node:crypto";
import { products, categories } from "./catalog.js";
import { planDay, seedId, fingerprint } from "./plan.js";
import { receipts } from "./receipts.js";

export const PROFILE = "forecast-demo-v2";
export const assumptions = {
  profile: PROFILE, averageOrdersPerDay: 10, weekdayWeights: [1.2, .85, .9, .95, 1, 1.1, 1.3],
  weeklyTrafficNoise: .08, basketWeightNoise: .10, annualDemandAmplitude: .05,
  classification: "Controlled synthetic weekly basket quotas; not client-confirmed demand or live accuracy",
};
const variants = products.flatMap(([name, category, , sizes]) => sizes.map(([size, price, recipe]) => ({ name, category, size, price, recipe })));
const drinks = variants.filter((v) => categories.Beverages.includes(v.category));
const foods = variants.filter((v) => categories.Food.includes(v.category));
const key = (v) => `${v.name}|${v.size}`;
const receiptUnits = new Map();
for (const [, , , , lines] of receipts) for (const [quantity, name, size] of lines) receiptUnits.set(`${name}|${size}`, (receiptUnits.get(`${name}|${size}`) || 0) + quantity);

// Fixed basket preferences create an explicit learnable simulation. This reduces
// weekly randomness intentionally; it must not be interpreted as observed demand.
const templates = variants.map((v, index) => {
  const complement = drinks.includes(v) ? foods[index % foods.length] : drinks[index % drinks.length];
  const lines = [v, complement].map((line) => ({ ...line, quantity: 1 }));
  if (index % 3 === 0) lines.push({ ...drinks[(index + 7) % drinks.length], quantity: 1 });
  return { lines, weight: 1 + Math.sqrt(receiptUnits.get(key(v)) || 0) };
});
// Selected receipts inform combinations; synthetic copies are capped at three
// units. The actual reconstructed receipts are appended separately, unchanged.
for (const [, , , , lines] of receipts) {
  const selected = [];
  for (const [quantity, name, size] of lines) {
    const variant = variants.find((v) => v.name === name && v.size === size);
    for (let i = 0; i < quantity && selected.length < 3; i++) selected.push({ ...variant, quantity: 1 });
  }
  if (selected.length >= 2) templates.push({ lines: selected, weight: 3 });
}

function randomFor(week) {
  let state = createHash("sha256").update(`${PROFILE}:${week}`).digest().readUInt32LE();
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}

/** Allocate integer orders without losing the selected weekly total. */
function quotas(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => total * w / sum);
  const counts = raw.map(Math.floor);
  const ranking = raw.map((v, i) => ({ i, fraction: v - counts[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let left = total - counts.reduce((a, b) => a + b, 0), i = 0; i < left; i++) counts[ranking[i].i]++;
  return counts;
}
const cache = new Map();

/** Whole-week generation makes a later extension reproduce the same earlier days. */
export function forecastDemoDay(day) {
  const date = new Date(day);
  const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const week = monday.toISOString().slice(0, 10);
  if (!cache.has(week)) {
    const random = randomFor(week);
    const elapsed = (Date.parse(week) - Date.parse("2025-01-01")) / 86400000;
    const trend = 1 + assumptions.annualDemandAmplitude * Math.sin(elapsed * 2 * Math.PI / 365.25);
    const total = Math.round(assumptions.averageOrdersPerDay * 7 * trend * (1 + (random() * 2 - 1) * assumptions.weeklyTrafficNoise));
    const counts = quotas(total, templates.map((t) => t.weight * (1 + (random() * 2 - 1) * assumptions.basketWeightNoise)));
    const baskets = counts.flatMap((count, i) => Array.from({ length: count }, () => templates[i].lines));
    // Shuffle basket placement; weekly counts never depend on future test sales.
    for (let i = baskets.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [baskets[i], baskets[j]] = [baskets[j], baskets[i]]; }
    const weekdays = [1, 2, 3, 4, 5, 6, 0];
    const dailyCounts = quotas(total, weekdays.map((d) => assumptions.weekdayWeights[d]));
    let cursor = 0;
    const days = new Map();
    for (let d = 0; d < 7; d++) {
      const current = new Date(monday); current.setUTCDate(monday.getUTCDate() + d);
      const dateKey = current.toISOString().slice(0, 10);
      const orders = baskets.slice(cursor, cursor + dailyCounts[d]).map((lines, i) => {
        const merged = new Map();
        for (const line of lines) merged.set(key(line), { ...line, quantity: (merged.get(key(line))?.quantity || 0) + 1 });
        return { id: seedId(`${PROFILE}:${dateKey}:${i}`), source: "synthetic", customer: `Demo guest ${i + 1}`,
          table: `Table ${1 + i % 8}`, payment: random() < .75 ? "cash" : random() < .5 ? "maya" : "gcash",
          minute: 16 * 60 + Math.floor(random() * 390), lines: [...merged.values()] };
      });
      days.set(dateKey, orders); cursor += dailyCounts[d];
    }
    cache.set(week, days);
  }
  // Reuse the existing transcription path solely for original receipt samples.
  return [...cache.get(week).get(day), ...planDay(day).filter((o) => o.source === "receipt")].sort((a, b) => a.minute - b.minute);
}

// Distinct checkpoints prevent resuming this profile with the legacy generator.
// Change PROFILE when generation behavior changes; assumptions/catalog are hashed too.
export const forecastSeed = {
  marker: `${PROFILE}:${createHash("sha256").update(JSON.stringify({ assumptions, fingerprint })).digest("hex")}`,
  planDay: forecastDemoDay,
};
