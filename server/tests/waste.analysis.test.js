import { it, expect } from "vitest";
import { buildWasteInsights, wasteStaleness } from "../src/modules/wasteReduction/wasteReduction.analysis.js";
const today = "2026-10-15";
const snapshot = () => ({ today, forecast: { id: 1, age_hours: 1 }, usage: [],
  ingredients: [{ ingredient_id: "milk", ingredient_name: "Milk", unit: "ml", minimum_threshold: 0 }],
  demand: [{ ingredient_id: "milk", variant_id: 1, quantity_needed: 1, skipped: false, daily_data: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${15+i}`, units: 10 })) }],
  batches: [{ ingredient_id: "milk", batch_id: 1, quantity_left: 100, cost_per_unit: 0.5, expiry_date: today, restocked_at: "2026-10-01", is_priority: false, version: 0 }] });

it("separates expired stock from estimated future waste and computes their costs independently", () => {
  const input = snapshot();
  input.batches.push({ ...input.batches[0], batch_id: 2, expiry_date: "2026-10-14", quantity_left: 50 });
  const rows = buildWasteInsights(input);
  const expired = rows.find(r => r.metadata.kind === "expired_stock");
  const risk = rows.find(r => r.metadata.kind === "expiry_risk");
  expect(expired.overstock_amount).toBe(50);
  expect(expired.metadata.estimated_cost_at_risk).toBe(25);
  expect(risk.overstock_amount).toBe(90);
  expect(risk.metadata.batches[0].quantity).toBe(100);
  expect(risk.metadata.batches[0].estimated_unused).toBe(90);
  expect(risk.metadata.estimated_cost_at_risk).toBe(45);
});
it("provides an expiry check with unknown unused stock for missing forecasts", () => {
  const input = snapshot(); input.forecast = null;
  const row = buildWasteInsights(input)[0];
  expect(row.metadata.kind).toBe("expiry_watch");
  expect(row.metadata.at_risk_quantity).toBeNull();
  expect(row.metadata.estimated_cost_at_risk).toBeNull();
  expect(row.overstock_amount).toBe(0);
});
it("does not label healthy stock as waste", () => {
  const input = snapshot(); input.batches[0].quantity_left = 70; input.batches[0].expiry_date = "2026-12-01";
  expect(buildWasteInsights(input)).toEqual([]);
});
it("labels long-life excess without claiming money saved", () => {
  const input = snapshot(); input.batches[0].quantity_left = 500; input.batches[0].expiry_date = "2026-12-01";
  const row = buildWasteInsights(input)[0];
  expect(row.metadata.kind).toBe("excess_stock");
  expect(row.metadata.usable_stock).toBe(500);
  expect(row.potential_savings).toBeNull();
  expect(row.metadata.estimated_cost_at_risk).toBeNull();
});
it.each(["balance", "priority", "expiry", "forecast", "recipe", "cost", "date"])("detects changed %s evidence", kind => {
  const input = snapshot(); const row = buildWasteInsights(input)[0];
  expect(wasteStaleness(row, buildWasteInsights(input)[0])).toBeNull();
  if (kind === "balance") input.batches[0].quantity_left++;
  if (kind === "priority") input.batches[0].is_priority = true;
  if (kind === "expiry") input.batches[0].expiry_date = "2026-10-16";
  if (kind === "forecast") input.forecast.id++;
  if (kind === "recipe") input.demand[0].quantity_needed++;
  if (kind === "cost") input.batches[0].cost_per_unit++;
  if (kind === "date") input.today = "2026-10-16";
  expect(wasteStaleness(row, buildWasteInsights(input)[0])).toBeTruthy();
});
it("keeps unchanged evidence stable as a forecast ages beyond 48 hours", () => {
  const input = snapshot(); const row = buildWasteInsights(input)[0];
  input.forecast.age_hours = 2;
  expect(wasteStaleness(row, buildWasteInsights(input)[0])).toBeNull();
  input.forecast.age_hours = 49;
  expect(wasteStaleness(row, buildWasteInsights(input)[0])).toBeNull();
});

it("uses available predictions even when another variant is skipped or has no predictions", () => {
  const input = snapshot(); input.forecast.age_hours = 100;
  input.demand.push({ ...input.demand[0], variant_id: 2, skipped: true, daily_data: [] });
  input.demand.push({ ...input.demand[0], variant_id: 3, daily_data: [] });
  const row = buildWasteInsights(input).find(r => r.metadata.kind === "expiry_risk");
  expect(row.metadata.at_risk_quantity).toBe(90);
  expect(row.forecasted_weekly_usage).toBe(70);
  expect(row.metadata.forecast_complete).toBe(true);
});

it("estimates early expiry with covered dates even if the forecast ends before seven days", () => {
  const input = snapshot(); input.demand[0].daily_data = input.demand[0].daily_data.slice(0, 2);
  const row = buildWasteInsights(input).find(r => r.metadata.kind === "expiry_risk");
  expect(row.metadata.at_risk_quantity).toBe(90);
  expect(row.metadata.forecast_complete).toBe(false);
  expect(buildWasteInsights(input).some(r => r.metadata.kind === "excess_stock")).toBe(false);
});

it("separates covered expiry from uncovered expiry without treating a missing date as zero", () => {
  const input = snapshot(); input.demand[0].daily_data = input.demand[0].daily_data.slice(0, 2);
  input.batches.push({ ...input.batches[0], batch_id: 2, expiry_date: "2026-10-18" });
  const rows = buildWasteInsights(input);
  expect(rows.find(r => r.metadata.kind === "expiry_risk").metadata.batches.map(b => b.batch_id)).toEqual([1]);
  const watch = rows.find(r => r.metadata.kind === "expiry_watch");
  expect(watch.metadata.batches.map(b => b.batch_id)).toEqual([2]);
  expect(watch.metadata.at_risk_quantity).toBeNull();
  expect(watch.metadata.missing_forecast_dates).toContain("2026-10-17");
});

it("does not estimate expiry after a gap even when later dates have predictions", () => {
  const input = snapshot(); input.batches[0].expiry_date = "2026-10-17";
  input.demand[0].daily_data = input.demand[0].daily_data.filter(d => d.date !== "2026-10-16");
  expect(buildWasteInsights(input)[0].metadata.kind).toBe("expiry_watch");
});

it("keeps valid zero predictions distinct from absent predictions", () => {
  const input = snapshot(); input.demand[0].daily_data.forEach(d => { d.units = 0; });
  expect(buildWasteInsights(input)[0].metadata.at_risk_quantity).toBe(100);
  input.demand[0].daily_data = [];
  expect(buildWasteInsights(input)[0].metadata.at_risk_quantity).toBeNull();
});
