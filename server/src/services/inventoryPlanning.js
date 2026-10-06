/**
 * Inventory advice policy. Quantities come from recipes, dated demand and batch
 * balances; provider text cannot change them. This module performs no writes.
 */
export const INVENTORY_POLICY = Object.freeze({ horizonDays: 7, leadTimeDays: 2, safetyBuffer: 0.2, version: 1 });
const round = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);

/** Round in the ingredient's stored unit, without confusing kg/l with g/ml. */
export function roundPurchase(quantity, unit) {
  const increment = ({ g: 50, ml: 50, kg: 0.05, l: 0.05, pcs: 1, pieces: 1 })[unit.toLowerCase()] ?? 0.001;
  return round(Math.ceil((quantity - 1e-9) / increment) * increment);
}

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
export function ingredientPlan(snapshot, ingredient) {
  const rows = snapshot.demand.filter(d => d.ingredient_id === ingredient.ingredient_id);
  const dates = Array.from({ length: INVENTORY_POLICY.horizonDays }, (_, i) => addDays(snapshot.today, i));
  const daily = Object.fromEntries(dates.map(d => [d, 0]));
  let complete = rows.length > 0 && snapshot.forecast && snapshot.forecast.age_hours != null
    && Number(snapshot.forecast.age_hours) >= 0 && Number(snapshot.forecast.age_hours) <= 48;
  for (const row of rows) {
    const entries = Array.isArray(row.daily_data) ? row.daily_data : [];
    if (row.skipped || dates.some(day => !entries.some(e => e.date === day && typeof e.units === "number" && Number.isFinite(e.units) && e.units >= 0))) complete = false;
    for (const entry of entries) if (entry.date in daily && !row.skipped) daily[entry.date] += Number(entry.units) * Number(row.quantity_needed);
  }
  // Partial predictions stay available as context, but cannot assert waste or full coverage.
  const batches = snapshot.batches.filter(b => b.ingredient_id === ingredient.ingredient_id);
  const simulation = simulateBatches(batches, complete ? daily : {}, snapshot.today);
  return { ...simulation, daily, complete: Boolean(complete), demand: Object.values(daily).reduce((sum, v) => sum + v, 0), batches };
}

/** Build purchase intent only; accepting it never reserves or adds inventory. */
export function calculateReorders(snapshot) {
  return snapshot.ingredients.flatMap(ingredient => {
    const plan = ingredientPlan(snapshot, ingredient);
    const threshold = Number(ingredient.minimum_threshold);
    const buffer = plan.complete ? plan.demand * INVENTORY_POLICY.safetyBuffer : 0;
    const effectiveStock = plan.usableStock - (plan.complete ? plan.expiringUnused : 0);
    const deficit = Math.max(0, (plan.complete ? Math.max(plan.demand + buffer, threshold) : threshold) - effectiveStock);
    const quantity = roundPurchase(deficit, ingredient.unit);
    if (quantity <= 0) return [];
    const firstShortage = plan.complete ? plan.unmet.find(d => d.quantity > 1e-9)?.date : null;
    const daysOut = firstShortage ? (Date.parse(firstShortage) - Date.parse(snapshot.today)) / 86400000 : null;
    const source = plan.complete ? "forecast" : "minimum_stock_fallback";
    return [{ ingredient_id: ingredient.ingredient_id, ingredient_name: ingredient.ingredient_name,
      current_stock: round(plan.usableStock), unit: ingredient.unit, suggested_quantity: quantity,
      urgency: plan.usableStock <= 0 || (daysOut != null && daysOut <= INVENTORY_POLICY.leadTimeDays) ? "high" : daysOut != null && daysOut <= 5 ? "medium" : "low",
      estimated_stockout: firstShortage, confidence: plan.complete ? 0.8 : 0.4,
      reasoning: plan.complete
        ? `Expected seven-day use ${round(plan.demand)} ${ingredient.unit}; usable stock ${round(plan.usableStock)}; estimated unused stock expiring in the period ${round(plan.expiringUnused)}. Includes a 20% demand buffer and respects minimum stock ${threshold}.`
        : `Forecast missing, incomplete or stale. Threshold fallback: usable stock ${round(plan.usableStock)} ${ingredient.unit}, minimum ${threshold}. No forecast-based coverage claim.`,
      metadata: { policy_version: INVENTORY_POLICY.version, source, forecast_id: snapshot.forecast?.id ?? null,
        as_of: snapshot.today, recent_daily_usage: snapshot.usage?.find(u => u.ingredient_id === ingredient.ingredient_id)?.daily_average ?? null, expected_demand: round(plan.demand), safety_buffer: round(buffer), lead_time_days: INVENTORY_POLICY.leadTimeDays } }];
  });
}

/** Separate dated waste exposure from excess purchasing; neither is a realized saving. */
export function calculateWaste(snapshot) {
  return snapshot.ingredients.flatMap(ingredient => {
    const plan = ingredientPlan(snapshot, ingredient);
    const expired = plan.expired.reduce((sum, b) => sum + b.remaining, 0);
    const risk = plan.complete ? plan.expiringUnused : 0;
    const excess = plan.complete && plan.demand > 0 && plan.usableStock > plan.demand * 1.5
      ? Math.max(0, plan.usableStock - plan.demand * (1 + INVENTORY_POLICY.safetyBuffer)) : 0;
    const soon = plan.batches.filter(b => b.expiry_date && b.expiry_date >= snapshot.today && b.expiry_date <= addDays(snapshot.today, 6));
    const watchQuantity = !plan.complete ? soon.reduce((sum, b) => sum + Number(b.quantity_left), 0) : 0;
    if (expired <= 0 && risk <= 0 && excess <= 0 && watchQuantity <= 0) return [];
    const kind = expired > 0 ? "expired_stock" : risk > 0 ? "expiry_risk" : watchQuantity > 0 ? "expiry_watch" : "excess_stock";
    const affected = [...plan.expired, ...(plan.complete ? plan.atRisk : soon.map(b => ({ ...b, remaining: Number(b.quantity_left) })))];
    const costBatches = plan.complete ? affected : plan.expired;
    const knownCost = costBatches.every(b => b.cost_per_unit != null && Number.isFinite(Number(b.cost_per_unit)));
    const exposure = costBatches.length && knownCost ? Math.round(costBatches.reduce((sum, b) => sum + b.remaining * Number(b.cost_per_unit), 0) * 100) / 100 : null;
    return [{ ingredient_id: ingredient.ingredient_id, ingredient_name: ingredient.ingredient_name,
      current_stock: round(plan.totalStock), forecasted_weekly_usage: round(plan.demand), unit: ingredient.unit,
      overstock_amount: round(expired + risk || excess), waste_risk: expired > 0 ? "high" : risk > 0 || watchQuantity > 0 ? "medium" : "low",
      potential_savings: null, confidence: plan.complete ? 0.8 : 0.4,
      reasoning: `Expired remaining stock: ${round(expired)} ${ingredient.unit}. ${plan.complete ? `Expected use ${round(plan.demand)} over seven days; estimated unused stock at expiry ${round(risk)}.` : "Forecast unavailable or incomplete; future waste quantity cannot be verified."}`,
      suggestion: expired > 0 ? "Inspect and confirm disposal using Record expired loss for the listed batches. Acceptance alone does not deduct stock."
        : risk > 0 ? "Review the affected batches and use before expiry where safe. Review batch priorities and reduce upcoming purchases."
        : watchQuantity > 0 ? "Review batches expiring soon. Run a current forecast before estimating unused quantities."
        : "Review future purchases; stock beyond weekly demand is not confirmed waste.",
      metadata: { policy_version: INVENTORY_POLICY.version, kind, as_of: snapshot.today, forecast_id: snapshot.forecast?.id ?? null,
        forecast_complete: plan.complete, expiring_watch_quantity: round(watchQuantity), expired_quantity: round(expired), at_risk_quantity: plan.complete ? round(risk) : null, excess_quantity: round(excess), estimated_cost_at_risk: exposure,
        batches: affected.map(b => ({ batch_id: b.batch_id, expiry_date: b.expiry_date, quantity: round(b.remaining), expired: b.expiry_date < snapshot.today })) } }];
  });
}
