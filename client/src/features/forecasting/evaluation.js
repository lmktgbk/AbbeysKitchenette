/** Aggregate held-out scores without dropping successful zero-sales predictions. */
function average(rows, key) {
  const values = rows.map((row) => row[key]).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Pooled R² measures differences across product-week totals, not individual accuracy. */
export function pooledR2(points) {
  const pairs = points.filter((point) => Number.isFinite(point.w_pred) && Number.isFinite(point.w_actual));
  if (pairs.length < 2) return null;
  const mean = average(pairs, "w_actual");
  const variation = pairs.reduce((sum, point) => sum + (point.w_actual - mean) ** 2, 0);
  return variation > 0
    ? 1 - pairs.reduce((sum, point) => sum + (point.w_actual - point.w_pred) ** 2, 0) / variation
    : null;
}

/** Keep product and baseline observations paired; absent legacy baselines are not zero. */
export function summarizeEvaluation(scores, forecasted, completed = 0) {
  if (!scores?.length) {
    const scored = forecasted.filter((row) => row.mae != null);
    if (!scored.length) return forecasted.length ? { unscored: forecasted.length } : null;
    return { r2: average(scored, "r_squared"), mae: average(scored, "mae"),
      rmse: Math.sqrt(average(scored, "mse") ?? 0), mse: average(scored, "mse"),
      count: scored.length, dailyMae: null, unscored: forecasted.length - scored.length };
  }
  const weeksOf = (score) => score.weeks?.length ? score.weeks : [score];
  const pairs = scores.flatMap(weeksOf);
  const mse = average(pairs, "w_mse");
  const origins = Math.max(...scores.map((score) => score.weeks?.length || 1));
  const originR2 = Array.from({ length: origins }, (_, index) =>
    pooledR2(scores.flatMap((score) => score.weeks?.[index] ? [score.weeks[index]] : []))
  ).filter(Number.isFinite);
  const matched = scores.flatMap((score) => (score.n_weeks || []).flatMap((baseline, index) => {
    const product = score.weeks?.[index];
    return product && product.w_actual === baseline.w_actual ? [{ product, baseline }] : [];
  }));
  const baseline = matched.map((pair) => pair.baseline);
  const comparison = matched.map((pair) => pair.product);
  return {
    r2: pooledR2(pairs), mae: average(pairs, "w_mae"), rmse: mse == null ? null : Math.sqrt(mse), mse,
    count: scores.length, dailyMae: average(scores, "mae"),
    unscored: Math.max(0, completed - scores.length),
    range: originR2.length > 1 ? [Math.min(...originR2), Math.max(...originR2)] : null,
    naive: baseline.length ? {
      mae: average(baseline, "w_mae"), rmse: Math.sqrt(average(baseline, "w_mse")), r2: pooledR2(baseline),
      observations: baseline.length,
      productMae: average(comparison, "w_mae"), productRmse: Math.sqrt(average(comparison, "w_mse")),
      productR2: pooledR2(comparison),
    } : null,
  };
}
