/**
 * Inventory advice policy. Quantities come from recipes, dated demand and batch
 * balances; provider text cannot change them. This module performs no writes.
 */
export const INVENTORY_POLICY = Object.freeze({ horizonDays: 7, safetyBuffer: 0.2, version: 1 });
const round = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);

/**
 * Simulate priority-first FIFO consumption. Expiry dates are usable through that
 * Manila business day; remaining quantities expire the following day. Clone the
 * input balances so checking advice never consumes real stock.
 */
export function simulateBatches(batches, dailyDemand, today, days = INVENTORY_POLICY.horizonDays) {
  const balances = batches.map(b => ({ ...b, remaining: Number(b.quantity_left) }))
    .sort((a, b) => Number(b.is_priority) - Number(a.is_priority) || String(a.restocked_at).localeCompare(String(b.restocked_at)) || a.batch_id - b.batch_id);
  const expired = balances.filter(b => b.expiry_date && b.expiry_date < today);
  const usable = balances.filter(b => !b.expiry_date || b.expiry_date >= today);
  const unmet = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(today, offset);
    let need = Number(dailyDemand[date] ?? 0);
    for (const batch of usable) {
      if (batch.expiry_date && batch.expiry_date < date) continue;
      const used = Math.min(batch.remaining, need);
      batch.remaining -= used; need -= used;
      if (need <= 1e-9) break;
    }
    unmet.push({ date, quantity: Math.max(0, need) });
  }
  const end = addDays(today, days - 1);
  const atRisk = usable.filter(b => b.expiry_date && b.expiry_date <= end && b.remaining > 1e-9);
  return { expired, atRisk, unmet, usableStock: usable.reduce((sum, b) => sum + Number(b.quantity_left), 0),
    totalStock: balances.reduce((sum, b) => sum + Number(b.quantity_left), 0),
    expiringUnused: atRisk.reduce((sum, b) => sum + b.remaining, 0) };
}

/**
 * Demand coverage is explicit: a missing/skipped variant is unknown, not zero.
 * Use the threshold fallback when the forecast is incomplete, old or does not
 * cover all seven upcoming business dates.
 */
export function ingredientPlan(snapshot, ingredient, { requireFresh = true } = {}) {
  const rows = snapshot.demand.filter(d => d.ingredient_id === ingredient.ingredient_id);
  const dates = Array.from({ length: INVENTORY_POLICY.horizonDays }, (_, i) => addDays(snapshot.today, i));
  const daily = Object.fromEntries(dates.map(d => [d, 0]));
  const issues = [];
  if (!snapshot.forecast) issues.push("No completed forecast available");
  if (!rows.length) issues.push("No linked variant recipes");
  if (requireFresh && snapshot.forecast && (snapshot.forecast.age_hours == null || Number(snapshot.forecast.age_hours) < 0 || Number(snapshot.forecast.age_hours) > 48)) issues.push("Forecast is over 48 hours old or has an invalid timestamp");
  let missingVariants = 0;
  const missingDates = new Set();
  for (const row of rows) {
    const entries = Array.isArray(row.daily_data) ? row.daily_data : [];
    if (row.skipped) missingVariants++;
    else for (const day of dates) if (!entries.some(e => e.date === day && typeof e.units === "number" && Number.isFinite(e.units) && e.units >= 0)) missingDates.add(day);
    for (const entry of entries) if (entry.date in daily && !row.skipped && typeof entry.units === "number" && Number.isFinite(entry.units) && entry.units >= 0) daily[entry.date] += entry.units * Number(row.quantity_needed);
  }
  if (missingVariants) issues.push(`${missingVariants} linked variant(s) missing or skipped`);
  if (missingDates.size) issues.push(`Forecast does not cover: ${[...missingDates].sort().join(", ")}`);
  const complete = issues.length === 0;
  // Partial predictions stay available as context, but cannot assert waste or full coverage.
  const batches = snapshot.batches.filter(b => b.ingredient_id === ingredient.ingredient_id);
  const simulation = simulateBatches(batches, complete ? daily : {}, snapshot.today);
  return { ...simulation, daily, complete, issues, demand: Object.values(daily).reduce((sum, v) => sum + v, 0), batches };
}

/** Show ingredient needs for the predictions actually saved in the selected run.
 * Missing variants do not block estimated coverage; reorder advice retains its own completeness checks.
 */
export function ingredientForecastRows(snapshot) {
  return snapshot.ingredients.flatMap(ingredient => {
    const daily = {};
    for (const row of snapshot.demand) {
      if (row.ingredient_id !== ingredient.ingredient_id || row.skipped || !Array.isArray(row.daily_data)) continue;
      for (const entry of row.daily_data) {
        if (typeof entry.units !== "number" || !Number.isFinite(entry.units) || entry.units < 0) continue;
        daily[entry.date] = (daily[entry.date] ?? 0) + entry.units * Number(row.quantity_needed);
      }
    }
    const dates = Object.keys(daily).sort();
    if (!dates.length) return [];
    const demand = Object.values(daily).reduce((sum, n) => sum + n, 0);
    const batches = snapshot.batches.filter(b => b.ingredient_id === ingredient.ingredient_id);
    const plan = simulateBatches(batches, daily, snapshot.today);
    const coverage = demand > 0 ? plan.usableStock / (demand / dates.length) : null;
    const shortage = plan.unmet.some(d => d.quantity > 1e-9);
    return { ingredient_id: ingredient.ingredient_id, name: ingredient.ingredient_name, unit: ingredient.unit,
      total_needed: round(demand), current_stock: round(plan.usableStock),
      daily_values: dates.map(date => ({ date, quantity: daily[date] })),
      days_covered: coverage == null ? null : Math.round(coverage * 10) / 10,
      status: shortage || (coverage != null && coverage < 3) ? "critical" : coverage != null && coverage < 7 ? "warning" : "ok" };
  });
}

/** Separate dated waste exposure from excess purchasing; neither is a realized saving. */
export function calculateWaste(snapshot) {
  return snapshot.ingredients.flatMap(ingredient => {
    // Waste advice uses available predictions, independently of reorder completeness policy.
    const dates = Array.from({ length: 7 }, (_, i) => addDays(snapshot.today, i));
    const daily = {};
    if (snapshot.forecast) for (const row of snapshot.demand.filter(d => d.ingredient_id === ingredient.ingredient_id && !d.skipped)) {
      if (!Number.isFinite(Number(row.quantity_needed)) || Number(row.quantity_needed) < 0) continue;
      for (const entry of Array.isArray(row.daily_data) ? row.daily_data : []) {
        if (dates.includes(entry.date) && typeof entry.units === "number" && Number.isFinite(entry.units) && entry.units >= 0)
          daily[entry.date] = (daily[entry.date] ?? 0) + entry.units * Number(row.quantity_needed);
      }
    }
    const batches = snapshot.batches.filter(b => b.ingredient_id === ingredient.ingredient_id);
    const missingDates = dates.filter(date => !(date in daily));
    const plan = { ...simulateBatches(batches, daily, snapshot.today), batches, daily,
      complete: missingDates.length === 0, demand: Object.values(daily).reduce((sum, value) => sum + value, 0) };
    const coveredThrough = expiry => dates.filter(date => date <= expiry).every(date => date in daily);
    plan.atRisk = plan.atRisk.filter(batch => coveredThrough(batch.expiry_date));
    const expired = plan.expired.reduce((sum, b) => sum + b.remaining, 0);
    const risk = plan.atRisk.reduce((sum, b) => sum + b.remaining, 0);
    const excess = plan.complete && plan.demand > 0 && plan.usableStock > plan.demand * 1.5
      ? Math.max(0, plan.usableStock - plan.demand * (1 + INVENTORY_POLICY.safetyBuffer)) : 0;
    const soon = plan.batches.filter(b => b.expiry_date && b.expiry_date >= snapshot.today && b.expiry_date <= addDays(snapshot.today, 6));
    const uncovered = soon.filter(b => !coveredThrough(b.expiry_date));
    const watchQuantity = uncovered.reduce((sum, b) => sum + Number(b.quantity_left), 0);
    if (expired <= 0 && risk <= 0 && excess <= 0 && watchQuantity <= 0) return [];
    const groups = [
      { kind: "expired_stock", quantity: expired, batches: plan.expired, level: "high",
        suggestion: `Do not use expired ${ingredient.ingredient_name}. Review ${plan.expired.map(b => `Batch #${b.batch_id}`).join(", ")} for disposal and record the confirmed expired loss.` },
      { kind: "expiry_risk", quantity: risk, batches: plan.atRisk, level: "medium",
        suggestion: `${ingredient.ingredient_name}: review ${plan.atRisk.map(b => `Batch #${b.batch_id} (expires ${b.expiry_date})`).join(", ")} for use before expiry. Available predictions leave an estimated ${round(risk)} ${ingredient.unit} unused; consider prioritizing an eligible batch.` },
      { kind: "expiry_watch", quantity: watchQuantity, batches: uncovered.map(b => ({ ...b, remaining: Number(b.quantity_left) })), level: "medium",
        suggestion: `${ingredient.ingredient_name}: check ${uncovered.map(b => `Batch #${b.batch_id} (expires ${b.expiry_date})`).join(", ")} before purchasing more. Predictions do not cover the full period through expiry, so remaining quantities cannot be estimated.` },
      { kind: "excess_stock", quantity: excess, batches: [], level: "low",
        suggestion: `${ingredient.ingredient_name} has ${round(plan.usableStock)} ${ingredient.unit} usable stock against ${round(plan.demand)} ${ingredient.unit} forecasted use over the next seven days. Review or postpone purchases; excess inventory is not confirmed waste.` },
    ];
    return groups.filter(group => group.quantity > 0).map(group => {
      const knownCost = group.batches.length > 0 && group.batches.every(b => b.cost_per_unit != null && Number.isFinite(Number(b.cost_per_unit)));
      const exposure = knownCost && group.kind !== "expiry_watch"
        ? Math.round(group.batches.reduce((sum, b) => sum + b.remaining * Number(b.cost_per_unit), 0) * 100) / 100 : null;
      return { ingredient_id: ingredient.ingredient_id, ingredient_name: ingredient.ingredient_name,
        current_stock: round(plan.totalStock), forecasted_weekly_usage: round(plan.demand), unit: ingredient.unit,
        overstock_amount: group.kind === "expiry_watch" ? 0 : round(group.quantity), waste_risk: group.level,
        potential_savings: null, confidence: plan.complete ? 0.8 : 0.4,
        reasoning: group.kind === "expired_stock" ? `${round(expired)} ${ingredient.unit} remains in expired batches.`
          : group.kind === "expiry_risk" ? `Estimated unused stock at expiry: ${round(risk)} ${ingredient.unit}, based on dated demand and priority-first FIFO.`
          : group.kind === "expiry_watch" ? "These batches expire within seven days; available demand information cannot establish how much will remain."
          : `Usable stock ${round(plan.usableStock)} ${ingredient.unit} exceeds 150% of expected seven-day use ${round(plan.demand)}. This is excess inventory, not confirmed waste.`,
        suggestion: group.suggestion,
        metadata: { policy_version: INVENTORY_POLICY.version, kind: group.kind, as_of: snapshot.today, forecast_id: snapshot.forecast?.id ?? null,
          forecast_complete: plan.complete, usable_stock: round(plan.usableStock),
          forecast_dates: Object.keys(daily).sort(), missing_forecast_dates: missingDates,
          forecast_generated_at: snapshot.forecast?.generated_at ?? null,
          prediction_basis: "Available variant predictions multiplied by recipe quantities; missing variants contribute no predicted use.",
          coverage_note: snapshot.forecast == null ? "No completed forecast available."
            : !snapshot.demand.some(d => d.ingredient_id === ingredient.ingredient_id) ? "No linked variant recipes."
            : Object.keys(daily).length === 0 ? "No available predictions for this ingredient on the upcoming dates."
            : missingDates.length ? `No prediction coverage for: ${missingDates.join(", ")}.` : null,
          expiring_watch_quantity: group.kind === "expiry_watch" ? round(watchQuantity) : 0,
          expired_quantity: group.kind === "expired_stock" ? round(expired) : 0,
          at_risk_quantity: group.kind === "expiry_watch" ? null : group.kind === "expiry_risk" ? round(risk) : 0,
          excess_quantity: group.kind === "excess_stock" ? round(excess) : 0, estimated_cost_at_risk: exposure,
          batches: group.batches.map(b => ({ batch_id: b.batch_id, expiry_date: b.expiry_date,
            quantity: round(Number(b.quantity_left)), estimated_unused: group.kind === "expiry_risk" ? round(b.remaining) : null,
            cost_per_unit: b.cost_per_unit, priority: Boolean(b.is_priority), expired: b.expiry_date < snapshot.today })) } };
    });
  });
}
