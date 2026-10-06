import { describe, it, expect } from "vitest";
import { calculateReorders, calculateWaste, simulateBatches, roundPurchase } from "../src/services/inventoryPlanning.js";
const today = "2026-10-06";
const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(today) + i * 86400000).toISOString().slice(0, 10));
const ingredient = { ingredient_id: "milk", ingredient_name: "Milk", unit: "ml", minimum_threshold: 0 };
const batch = (id, qty, expiry, priority = false) => ({ batch_id: id, ingredient_id: "milk", quantity_left: qty,
  expiry_date: expiry, is_priority: priority, cost_per_unit: 0.1234, restocked_at: `2026-09-${String(id).padStart(2, "0")}` });
const snapshot = (batches = [], demand = 10) => ({ today, forecast: { id: 1, age_hours: 1 }, ingredients: [ingredient], batches,
  demand: [{ ingredient_id: "milk", quantity_needed: 1, skipped: false, daily_data: days.map(date => ({ date, units: demand })) }] });

describe("Dated inventory advice", () => {
  it("sums multiple variant recipes by day and uses a demand buffer", () => {
    const input = snapshot([batch(1, 100, null)]);
    input.demand.push({ ...input.demand[0] });
    const [result] = calculateReorders(input);
    expect(result.metadata.expected_demand).toBe(140);
    expect(result.suggested_quantity).toBe(100); // 168 - 100 rounded upward to 50 ml
  });
  it("keeps kg/l purchase rounding distinct from g/ml", () => {
    expect(roundPurchase(1, "kg")).toBe(1);
    expect(roundPurchase(1.01, "l")).toBe(1.05);
    expect(roundPurchase(51, "g")).toBe(100);
    expect(roundPurchase(1.2, "pcs")).toBe(2);
  });
  it("uses stock on its expiry day but never on a later day", () => {
    const input = snapshot([batch(1, 50, today)]);
    const plan = simulateBatches(input.batches, Object.fromEntries(days.map(d => [d, 10])), today);
    expect(plan.atRisk[0].remaining).toBe(40);
    expect(plan.unmet[0].quantity).toBe(0);
    expect(plan.unmet[1].quantity).toBe(10);
    expect(input.batches[0].quantity_left).toBe(50);
  });
  it("honors priority overrides rather than assuming FEFO", () => {
    const input = snapshot([batch(1, 10, today), batch(2, 100, null, true)]);
    expect(calculateWaste(input)[0].metadata.at_risk_quantity).toBe(10);
  });
  it("excludes expired stock from purchase coverage and retains disposal quantities", () => {
    const input = snapshot([batch(1, 100, "2026-10-05")]);
    expect(calculateReorders(input)[0].current_stock).toBe(0);
    const [waste] = calculateWaste(input);
    expect(waste.metadata.expired_quantity).toBe(100);
    expect(waste.metadata.estimated_cost_at_risk).toBe(12.34);
  });
  it("does not claim long-life excess is guaranteed waste or savings", () => {
    const [waste] = calculateWaste(snapshot([batch(1, 500, "2027-01-01")]));
    expect(waste.metadata.kind).toBe("excess_stock");
    expect(waste.metadata.at_risk_quantity).toBe(0);
    expect(waste.potential_savings).toBeNull();
    expect(waste.metadata.estimated_cost_at_risk).toBeNull();
  });
  it.each(["missing", "stale", "skipped", "partial"])("labels %s forecasts and avoids invented waste", kind => {
    const input = snapshot([batch(1, 10, null)]);
    input.ingredients = [{ ...ingredient, minimum_threshold: 20 }];
    if (kind === "missing") input.forecast = null;
    if (kind === "stale") input.forecast.age_hours = 49;
    if (kind === "skipped") input.demand[0].skipped = true;
    if (kind === "partial") input.demand[0].daily_data.pop();
    expect(calculateReorders(input)[0].metadata.source).toBe("minimum_stock_fallback");
    expect(calculateWaste(input)).toEqual([]);
  });
  it("keeps uncertain expiry quantities separate from confirmed expired exposure", () => {
    const input = snapshot([batch(1, 10, "2026-10-05"), batch(2, 100, today)]);
    input.forecast = null;
    const [waste] = calculateWaste(input);
    expect(waste.metadata.at_risk_quantity).toBeNull();
    expect(waste.metadata.expiring_watch_quantity).toBe(100);
    expect(waste.metadata.estimated_cost_at_risk).toBe(1.23);
  });
  it("does not invent ingredient costs when an affected batch cost is missing", () => {
    const input = snapshot([{ ...batch(1, 10, "2026-10-05"), cost_per_unit: null }]);
    expect(calculateWaste(input)[0].metadata.estimated_cost_at_risk).toBeNull();
  });
});
