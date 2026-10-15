import { describe, it, expect } from "vitest";
import { buildReorderContexts, normalizeReorders, reorderStaleness, selectReorderCandidates, reorderReviewReasons } from "../src/modules/reorderSuggestions/reorderSuggestions.analysis.js";
const days = Array.from({ length: 7 }, (_, i) => `2026-10-${String(15 + i).padStart(2, "0")}`);
const snapshot = () => ({ today: days[0], forecast: { id: 1, age_hours: 1, generated_at: "2026-10-15" },
  ingredients: [{ ingredient_id: "milk", ingredient_name: "Milk", unit: "ml", minimum_threshold: 100 }], usage: [],
  demand: [{ ingredient_id: "milk", variant_id: 1, quantity_needed: 10, skipped: false, daily_data: days.map(date => ({ date, units: 5 })) }],
  batches: [{ ingredient_id: "milk", batch_id: 1, quantity_left: 200, expiry_date: days[0], restocked_at: "2026-10-01", is_priority: false }] });
const output = (changes = {}) => ({ recommendations: [{ ingredient_id: "milk", unit: "ml", suggested_quantity: 500, urgency: "high", reason: "Cover expected consumption with an allowance.", ...changes }] });

describe("Gemini restock advice", () => {
  it("excludes healthy ingredients without forecast or recorded consumption", () => {
    const input = snapshot(); input.forecast = null; input.demand = [];
    input.batches[0].quantity_left = 1500; input.batches[0].expiry_date = null;
    expect(selectReorderCandidates(buildReorderContexts(input))).toEqual([]);
  });
  it("excludes healthy stock sufficient for forecast demand", () => {
    const input = snapshot(); input.batches[0].quantity_left = 1000; input.batches[0].expiry_date = null;
    expect(selectReorderCandidates(buildReorderContexts(input))).toEqual([]);
  });
  it.each([0, 99])("includes out-of-stock or below-minimum stock %i", stock => {
    const input = snapshot(); input.forecast = null; input.demand = [];
    input.batches[0].quantity_left = stock; input.batches[0].expiry_date = null;
    expect(selectReorderCandidates(buildReorderContexts(input))).toHaveLength(1);
  });
  it("includes predicted shortages without requiring a complete forecast", () => {
    const input = snapshot(); input.demand[0].daily_data.pop(); input.batches[0].expiry_date = null;
    expect(reorderReviewReasons(buildReorderContexts(input)[0])).toContain("Predicted consumption exceeds usable stock");
  });
  it("includes expiry-related shortages even when initial stock exceeds the week's demand", () => {
    const input = snapshot(); input.batches[0].quantity_left = 1500;
    expect(reorderReviewReasons(buildReorderContexts(input)[0])).toContain("Upcoming expiry could leave a shortage");
  });
  it("does not flag soon-expiring stock when other stock still covers demand and minimum", () => {
    const input = snapshot();
    input.batches.push({ ...input.batches[0], batch_id: 2, quantity_left: 1500, expiry_date: null });
    expect(selectReorderCandidates(buildReorderContexts(input))).toEqual([]);
  });
  it("uses recent consumption only when missing demand could leave a shortage", () => {
    const input = snapshot(); input.forecast = null; input.demand = [];
    input.batches[0].expiry_date = null;
    input.usage = [{ ingredient_id: "milk", daily_average: 50 }];
    expect(reorderReviewReasons(buildReorderContexts(input)[0])).toContain("Incomplete forecast; recent consumption indicates a shortage");
    input.batches[0].quantity_left = 1500;
    expect(selectReorderCandidates(buildReorderContexts(input))).toEqual([]);
  });
  it("estimates consumption and unused stock at expiry without treating all stock as future coverage", () => {
    const [c] = buildReorderContexts(snapshot());
    expect(c.expected_use).toBe(350);
    expect(c.usable_stock).toBe(200);
    expect(c.estimated_unused_at_expiry).toBe(150);
    expect(c.first_shortage).toBe(days[1]);
    expect(c.forecast_complete).toBe(true);
  });
  it("keeps the AI quantity and flags shortages instead of replacing it", () => {
    const [row] = normalizeReorders(output({ suggested_quantity: 10 }), buildReorderContexts(snapshot()));
    expect(row.suggested_quantity).toBe(10);
    expect(row.metadata.warnings.join(" ")).toContain("may not cover");
  });
  it("supports zero recommendations", () => {
    const [row] = normalizeReorders(output({ suggested_quantity: 0 }), buildReorderContexts(snapshot()));
    expect(row.suggested_quantity).toBe(0);
    expect(row.urgency).toBe("low");
  });
  it.each([{ suggested_quantity: -1 }, { suggested_quantity: Infinity }, { suggested_quantity: "500" },
    { suggested_quantity: 1.0001 }, { suggested_quantity: 10000000 }, { unit: "l" }, { ingredient_id: "foreign" }, { reason: "" }])("rejects invalid output %j", change => {
    expect(() => normalizeReorders(output(change), buildReorderContexts(snapshot()))).toThrow();
  });
  it("rejects duplicate or missing ingredient recommendations", () => {
    const c = buildReorderContexts(snapshot());
    expect(() => normalizeReorders({ recommendations: [] }, c)).toThrow();
    const r = output(); r.recommendations.push(r.recommendations[0]);
    expect(() => normalizeReorders(r, [...c, { ...c[0], ingredient_id: "other" }])).toThrow();
  });
  it("rejects fractional pieces", () => {
    const c = buildReorderContexts(snapshot()).map(c => ({ ...c, unit: "pcs" }));
    expect(() => normalizeReorders(output({ unit: "pcs", suggested_quantity: 1.5 }), c)).toThrow();
  });
  it.each(["stock", "expiry", "priority", "recipe", "forecast", "date", "threshold"])("marks advice stale when %s changes", kind => {
    const input = snapshot();
    const [row] = normalizeReorders(output(), buildReorderContexts(input));
    expect(reorderStaleness(row, buildReorderContexts(input)[0])).toBeNull();
    if (kind === "stock") input.batches[0].quantity_left++;
    if (kind === "expiry") input.batches[0].expiry_date = days[1];
    if (kind === "priority") input.batches[0].is_priority = true;
    if (kind === "recipe") input.demand[0].quantity_needed++;
    if (kind === "forecast") input.forecast.id++;
    if (kind === "date") input.today = days[1];
    if (kind === "threshold") input.ingredients[0].minimum_threshold++;
    expect(reorderStaleness(row, buildReorderContexts(input)[0])).toBeTruthy();
  });
  it("does not invalidate advice merely because the forecast age advanced", () => {
    const input = snapshot();
    const [row] = normalizeReorders(output(), buildReorderContexts(input));
    input.forecast.age_hours = 2;
    expect(reorderStaleness(row, buildReorderContexts(input)[0])).toBeNull();
  });
  it("requires regeneration of legacy suggestions and advice for archived ingredients", () => {
    const [context] = buildReorderContexts(snapshot());
    expect(reorderStaleness({ metadata: { policy_version: 1 } }, context)).toBeTruthy();
    expect(reorderStaleness({ metadata: { policy_version: 2, fingerprint: context.fingerprint } }, undefined)).toBeTruthy();
  });
  it("discloses skipped variants and missing dates; does not invent expiry waste", () => {
    const input = snapshot(); input.demand[0].daily_data.pop();
    const [c] = buildReorderContexts(input);
    expect(c.forecast_complete).toBe(false);
    expect(c.expected_use).toBe(300);
    expect(c.forecast_issues.join(" ")).toContain(days[6]);
    expect(c.estimated_unused_at_expiry).toBeNull();
    input.demand[0].skipped = true;
    expect(buildReorderContexts(input)[0].expected_use_available).toBe(false);
  });
});
