import { describe, it, expect } from "vitest";
import { ingredientPlan, ingredientForecastRows, calculateWaste, simulateBatches } from "../src/services/inventoryPlanning.js";
import { buildReorderContexts } from "../src/modules/reorderSuggestions/reorderSuggestions.analysis.js";
const today = "2026-10-06";
const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(today) + i * 86400000).toISOString().slice(0, 10));
const ingredient = { ingredient_id: "milk", ingredient_name: "Milk", unit: "ml", minimum_threshold: 0 };
const batch = (id, qty, expiry, priority = false) => ({ batch_id: id, ingredient_id: "milk", quantity_left: qty,
  expiry_date: expiry, is_priority: priority, cost_per_unit: 0.1234, restocked_at: `2026-09-${String(id).padStart(2, "0")}` });
const snapshot = (batches = [], demand = 10) => ({ today, forecast: { id: 1, age_hours: 1 }, ingredients: [ingredient], batches,
  demand: [{ ingredient_id: "milk", quantity_needed: 1, skipped: false, daily_data: days.map(date => ({ date, units: demand })) }] });

describe("Dated inventory advice", () => {
  it("shows needs and coverage from predicted variants even when another linked variant was skipped", () => {
    const input = snapshot([batch(1, 35, null)]);
    input.demand.push({ ingredient_id: "milk", quantity_needed: 500, skipped: true, daily_data: [] });
    const [row] = ingredientForecastRows(input);
    expect(row.total_needed).toBe(70);
    expect(row.current_stock).toBe(35);
    expect(row.days_covered).toBe(3.5);
    expect(row.status).toBe("critical");
    expect(buildReorderContexts(input)[0].forecast_complete).toBe(false);
  });
  it("does not invent demand for ingredients linked only to skipped variants", () => {
    const input = snapshot(); input.demand[0].skipped = true;
    expect(ingredientForecastRows(input)).toEqual([]);
  });
  it("shows zero predicted use without dividing by zero", () => {
    const [row] = ingredientForecastRows(snapshot([], 0));
    expect(row.total_needed).toBe(0);
    expect(row.days_covered).toBeNull();
    expect(row.status).toBe("ok");
  });
  it("keeps selected forecast needs when its dates are historical", () => {
    const input = snapshot([batch(1, 140, null)]); input.today = "2026-10-20";
    const [row] = ingredientForecastRows(input);
    expect(row.total_needed).toBe(70);
    expect(row.days_covered).toBe(14);
    expect(row.status).toBe("ok");
  });
  it("warns when existing stock expires before predicted consumption despite high average coverage", () => {
    const [row] = ingredientForecastRows(snapshot([batch(1, 700, today)]));
    expect(row.days_covered).toBe(70);
    expect(row.status).toBe("critical");
  });
  it("sums multiple variant recipes by day without choosing a purchase quantity", () => {
    const input = snapshot([batch(1, 100, null)]);
    input.demand.push({ ...input.demand[0] });
    const [result] = buildReorderContexts(input);
    expect(result.expected_use).toBe(140);
    expect(result).not.toHaveProperty("suggested_quantity");
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
    expect(buildReorderContexts(input)[0].usable_stock).toBe(0);
    expect(ingredientForecastRows(input)[0].current_stock).toBe(0);
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
    expect(ingredientPlan(input, ingredient).complete).toBe(false);
    expect(calculateWaste(input)).toEqual([]);
  });
  it("keeps uncertain expiry quantities separate from confirmed expired exposure", () => {
    const input = snapshot([batch(1, 10, "2026-10-05"), batch(2, 100, today)]);
    input.forecast = null;
    const rows = calculateWaste(input);
    const expired = rows.find(row => row.metadata.kind === "expired_stock");
    const watch = rows.find(row => row.metadata.kind === "expiry_watch");
    expect(expired.overstock_amount).toBe(10);
    expect(expired.metadata.estimated_cost_at_risk).toBe(1.23);
    expect(watch.metadata.at_risk_quantity).toBeNull();
    expect(watch.metadata.expiring_watch_quantity).toBe(100);
    expect(watch.metadata.estimated_cost_at_risk).toBeNull();
  });
  it("does not invent ingredient costs when an affected batch cost is missing", () => {
    const input = snapshot([{ ...batch(1, 10, "2026-10-05"), cost_per_unit: null }]);
    expect(calculateWaste(input)[0].metadata.estimated_cost_at_risk).toBeNull();
  });
});
