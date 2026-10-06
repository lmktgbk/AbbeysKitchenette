import { formatPeso } from "@/lib/money";
import { formatDemand } from "../formatDemand";
import { useState, useMemo, useCallback } from "react";
import { useDemandHistory, useDemandResults, useDemandIngredients, forecastKeys } from "../query";
import { useQueryClient } from "@tanstack/react-query";
import { summarizeEvaluation } from "../evaluation";
import ForecastRunButton from "../components/ForecastRunButton";
import SimpleForecastChart from "../components/SimpleForecastChart";
import ProductDemandTab from "../components/ProductDemandTab";
import IngredientOrderTab from "../components/IngredientOrderTab";
import { Skeleton } from "@/components/ui/skeleton";
import { StatLabel, StatValue, StatSub } from "@/components/ui/stat";
import Icon from "@/components/ui/icon";

/** Undefined scores must remain visibly unavailable rather than becoming 0%. */
function formatR2(value) {
  return value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

/** Show individual errors alongside the pooled headline so volume differences do not hide weak variants. */
function IndividualEvaluation({ scores, variants }) {
  const names = new Map(variants.map((variant) => [variant.variant_id, variant.size_name]));
  const rows = scores.flatMap((score) => [
    { ...score, label: score.product_name, key: `product:${score.product_id}` },
    ...(score.variant_scores || []).map((variant) => ({
      ...variant,
      key: `variant:${variant.variant_id}`,
      label: `${score.product_name} / ${names.get(variant.variant_id) || variant.variant_id}${["variant_prophet_raw", "variant_prophet_expected", "variant_prophet_expected_flat"].includes(score.forecast_method) ? "" : " (allocated)"}`,
    })),
  ]);
  return (
    <details className="rounded-xl border border-border p-4 text-sm">
      <summary className="cursor-pointer">Individual product and variant evaluation</summary>
      <p className="my-2 text-xs text-muted-foreground">
        Training through {scores[0].training_cutoff || "cutoff unavailable (older run)"}.
        {["variant_prophet_raw", "variant_prophet_expected", "variant_prophet_expected_flat"].includes(scores[0].forecast_method)
          ? " Each variant is forecast independently with Prophet using unit counts."
          : " Legacy run: variant quantities were allocated from historical sales mix."}
        R² is N/A when actual sales have no variation. Errors below measure daily units.
      </p>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead><tr><th className="text-left">Product / variant</th><th>R²</th><th>MAE</th><th>RMSE</th><th>MSE</th></tr></thead>
          <tbody>
            {rows.map((score) => (
              <tr key={score.key} className="border-b border-border">
                <td className="py-2">{score.label}</td>
                <td className="px-2 text-center">{formatR2(score.r_squared)}</td>
                {[score.mae, score.rmse, score.mse].map((value, index) => (
                  <td key={index} className="px-2 text-center">{value == null ? "N/A" : value.toFixed(2)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * ForecastingPage — friendly redesign.
 * Answers only 3 questions: Demand (Expected Units), Revenue (Expected Sales), Inventory (What to Order)
 * Plain language, 3 KPI cards + combined chart + tabbed details. Tech behind Details flap.
 *
 * State (Rule of Thumb):
 * - API data via TanStack Query: jobs history, demand results + ingredients keyed by activeJobId.
 * - Browser-only via useState: selectedJobId override, activeTab, selectedVariant, showDetails.
 * - activeJobId is DERIVED (selected ?? first job) — never mirrored back into state via effect,
 *   so first paint selects without a null-first fetch or double skeleton.
 */
export default function ForecastingPage() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [activeTab, setActiveTab] = useState("products");
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const { data: historyData, isLoading: historyLoading } = useDemandHistory();
  const jobs = historyData?.data?.jobs || [];
  const activeJobId = selectedJobId ?? jobs[0]?.id ?? null;

  const { data: resultsData, isLoading: resultsLoading } = useDemandResults(activeJobId);
  const { data: ingredientsData, isLoading: ingredientsLoading, isError: ingredientsError } = useDemandIngredients(activeJobId);

  // Job switching clears the chart selection explicitly in handleJobComplete below —
  // no useEffect mirror needed (derived activeJobId never writes back to state).

  // Select the finished run and discard filters belonging to the previous result set.
  const handleJobComplete = useCallback((jobId) => {
    setSelectedJobId(jobId);
    setSelectedVariant(null);
    setSelectedProduct(null);
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandResults(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandIngredients(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandHistory });
  }, [queryClient]);

  const forecasted = useMemo(() => resultsData?.data?.forecasted || [], [resultsData]);
  const ingredients = useMemo(() => ingredientsData?.data?.ingredients || [], [ingredientsData]);
  const recipeMissing = ingredientsData?.data?.recipe_missing_variants || [];
  const ingredientIncomplete = ingredientsError || ingredientsLoading || !ingredientsData || recipeMissing.length > 0;
  const job = resultsData?.data?.job;
  const skipped = resultsData?.data?.skipped || [];
  const productScores = job?.product_scores || null;
  const coverage = productScores?.[0]?.coverage;
  // Historical saved runs keep their original rounded quantities and scores.
  const expectedDemand = productScores?.some((score) => ["variant_prophet_expected", "variant_prophet_expected_flat"].includes(score.forecast_method));
  // A zero forecast is different from a skipped product and remains in evaluation.
  const productCounts = useMemo(() => {
    const totals = new Map();
    for (const variant of forecasted) {
      const key = variant.product_id ?? variant.product_name;
      totals.set(key, (totals.get(key) || 0) + variant.total_units);
    }
    return { total: totals.size, zero: [...totals.values()].filter((units) => units === 0).length };
  }, [forecasted]);

  const periodTotals = useMemo(() => {
    if (!forecasted.length) return { units: 0, revenue: 0 };
    return forecasted.reduce((acc, v) => ({
      units: acc.units + v.daily_data.slice(0, 7).reduce((s, d) => s + d.units, 0),
      revenue: acc.revenue + v.daily_data.slice(0, 7).reduce((s, d) => s + d.revenue, 0),
    }), { units: 0, revenue: 0 });
  }, [forecasted]);

  const lowIngredients = useMemo(() => ingredients.filter((i) => i.status !== "ok" && Number(i.total_needed || 0) > 0.01), [ingredients]);
  const topNeed = useMemo(() => {
    const rank = { critical: 0, warning: 1 };
    return [...lowIngredients].sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2) || Number(b.total_needed) - Number(a.total_needed)).slice(0, 3);
  }, [lowIngredients]);

  const selectedVariantName = useMemo(() => {
    if (selectedVariant) {
      const v = forecasted.find((f) => String(f.variant_id) === String(selectedVariant));
      return v ? `${v.product_name} (${v.size_name})` : null;
    }
    if (selectedProduct) {
      const v = forecasted.find((f) => String(f.product_id ?? f.product_name) === String(selectedProduct));
      return v ? `${v.product_name} (all sizes)` : null;
    }
    return null;
  }, [selectedVariant, selectedProduct, forecasted]);

  const chartVariantFilter = selectedVariant ?? null;
  const chartProductFilter = !selectedVariant ? selectedProduct : null;

  // selectedVariant clears on explicit job switch via handleSelectJob/handleJobComplete —
  // no useEffect mirror needed (derived activeJobId never writes back to state).

  const lastUpdated = job?.completed_at ? new Date(job.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  const hasData = forecasted.length > 0;
  const isFailed = job?.status === "failed";
  const showLoading = resultsLoading && !job;

  // Calculate product and baseline summaries from the same stored observations.
  const productMetrics = useMemo(
    () => summarizeEvaluation(productScores, forecasted, job?.completed),
    [productScores, forecasted, job?.completed],
  );

  // The model predicts variants; product sums are a separate secondary evaluation.
  const variantMetrics = useMemo(() => summarizeEvaluation(
    productScores?.flatMap((score) => score.variant_scores || []).filter((score) => score.weeks?.length), [],
  ), [productScores]);

  // Do not substitute product scores when an older run lacks variant evaluation.
  const evalMetrics = variantMetrics;

  // ── Loading skeletons ──
  if (historyLoading || showLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-[360px] w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // ── Empty ──
  if (!jobs.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Icon name="trendingUp" size={48} className="mx-auto text-muted-foreground/30" />
          <h2 className="mt-4 text-base font-semibold text-foreground">Sales Forecast — Next 7 Days</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            See expected demand, how much you’ll sell, and what to order — based on your past sales.
          </p>
          <div className="mt-6 flex justify-center">
            <ForecastRunButton onJobComplete={handleJobComplete} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Runtime depends on sales history and variant count. Progress shows on the button. Needs at least 7 calendar days since a variant’s first sale.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header + plain summary */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-foreground">Demand Forecast for 7 Days</h1>
            {!hasData ? (
              <p className="mt-1 text-sm text-muted-foreground">No predictions yet — tap Update Forecast to generate.</p>
            ) : null}
            {hasData && <p className="mt-1 text-xs text-muted-foreground">
              {expectedDemand
                ? "Fractional expected units describe average demand, not whole items to prepare."
                : "Legacy rounded forecast. Generate a new forecast for fractional expected demand and matching evaluation."}
            </p>}
            {lastUpdated && <p className="mt-1 text-xs text-muted-foreground">Last updated: {lastUpdated}</p>}
            {hasData && <p className="mt-1 text-xs text-muted-foreground">{productCounts.total} products forecasted · {productCounts.zero} with zero expected demand. The product table shows positive demand.</p>}
          </div>
          <div className="shrink-0">
            <ForecastRunButton onJobComplete={handleJobComplete} />
          </div>
        </div>
        {isFailed && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            <Icon name="alertCircle" size={14} className="mt-0.5 text-destructive" />
            <p className="text-xs text-destructive">Something went wrong: {job.error_message || "Try again."}</p>
          </div>
        )}
        {!hasData && !isFailed && skipped.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
            <p className="text-xs text-amber-800 dark:text-amber-300">Need more history — at least 7 calendar days since a variant’s first sale. {skipped.length} variants waiting.</p>
          </div>
        )}
      </div>

      {productScores?.[0]?.training_cutoff && (
        <div className="rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground">
          <p>Training through {productScores[0].training_cutoff} (Asia/Manila); forecast dates are shown in the chart.</p>
          {coverage?.gap_days > 0 && <p className="mt-1">
            {coverage.gap_days} dates have no recorded completed sales across the menu.
            {coverage.trailing_gap_days > 0 ? ` Last recorded sale: ${coverage.last_sale}.` : ""}
            {" "}Empty dates are treated as zero recorded sales; closure and incomplete records cannot be distinguished.
          </p>}
          {coverage?.recent_gap_dates?.length > 0 && <details className="mt-1">
            <summary className="cursor-pointer">Recent dates without recorded sales</summary>
            <p className="mt-1">{coverage.recent_gap_dates.join(", ")}</p>
          </details>}
        </div>
      )}

      {/* 3 KPI Cards */}
      {hasData && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-border bg-card p-5">
            <StatLabel>Demand — Expected Demand</StatLabel>
            <StatValue size="hero" className="mt-1">{formatDemand(periodTotals.units)}</StatValue>
            <StatSub>Total forecast for 7 days · avg {formatDemand(periodTotals.units/7)} items/day</StatSub>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-5">
            <StatLabel>Expected Sales</StatLabel>
            <StatValue size="hero" className="mt-1">{formatPeso(periodTotals.revenue, 2)}</StatValue>
            <StatSub>Total for 7 days · avg {formatPeso(periodTotals.revenue / 7, 2)}/day</StatSub>
          </div>
          <div className={`min-w-0 rounded-xl border p-5 ${lowIngredients.length ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/10" : "border-border bg-card"}`}>
            <StatLabel>What to Order</StatLabel>
            {lowIngredients.length ? (
              <>
                <StatValue size="hero" className="mt-1 text-amber-700 dark:text-amber-400">{lowIngredients.length} low</StatValue>
                {/* Long ingredient names wrap within the grid cell instead of widening it. */}
                <StatSub className="block whitespace-normal break-words">{topNeed.map((i)=> i.name).join(", ")}{lowIngredients.length > 3 ? ` +${lowIngredients.length-3} more` : ""}</StatSub>
              </>
            ) : (
              <>
                <StatValue size="hero" className="mt-1 text-green-700 dark:text-green-400">{ingredientIncomplete ? "Review needed" : "All good"}</StatValue>
                <StatSub className="block whitespace-normal break-words">{ingredientIncomplete ? "Ingredient calculation incomplete; check recipes and resale items" : "No urgent orders"}</StatSub>
              </>
            )}
          </div>
        </div>
      )}

      {recipeMissing.length > 0 && <p className="text-sm text-amber-700">{recipeMissing.length} forecasted variants have no recipe. Confirm they are resale items; otherwise ingredient requirements are incomplete.</p>}
      {forecasted.some((variant) => variant.current_available === false && variant.total_units > 0) && (
        <p className="text-sm text-amber-700">Demand includes currently unavailable variants. Review availability before preparing items; projected revenue assumes those variants can be sold.</p>
      )}
      {/* 7-Day Forecast Plan Chart — filters when a product or size is selected */}
      {hasData && (
        <SimpleForecastChart
          results={forecasted}
          selectedVariant={chartVariantFilter}
          selectedProduct={chartProductFilter}
          selectedVariantName={selectedVariantName}
          onClear={() => { setSelectedVariant(null); setSelectedProduct(null); }}
          isLoading={ingredientsLoading}
        />
      )}

      {/* Product / Ingredient Forecast — pill inside table */}
      {hasData && (
        activeTab === "products" ? (
          <ProductDemandTab
            results={forecasted}
            productScores={productScores}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            selectedVariant={selectedVariant}
            selectedProduct={selectedProduct}
            onSelectVariant={(v) => { setSelectedVariant(v); if (v) setSelectedProduct(null); }}
            onSelectProduct={(p) => { setSelectedProduct(p); if (p) setSelectedVariant(null); }}
          />
        ) : (
          <IngredientOrderTab
            ingredients={ingredients}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )
      )}

      {productScores?.length > 0 && <IndividualEvaluation scores={productScores} variants={forecasted} />}
      {/* Evaluation — clean card, matches KPI/Chart style */}
      {hasData && (evalMetrics || productMetrics) && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button onClick={() => setShowDetails(!showDetails)} className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
            <div className="text-left">
              <h3 className="text-sm font-semibold text-foreground">Variant Evaluation</h3>
              <p className="text-xs text-muted-foreground">How accurately are individual variants forecast?</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {evalMetrics?.count != null ? (
                <>
                  <span title="Pooled R-squared across held-out variant-week totals" className="hidden sm:inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Pooled R² {formatR2(evalMetrics.r2)}
                  </span>
                  <span title="Mean Absolute Error — typical weekly miss per variant" className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Typical error {evalMetrics.mae.toFixed(1)}/week{evalMetrics.dailyMae != null ? ` · ±${evalMetrics.dailyMae.toFixed(1)}/day` : ""}
                  </span>
                </>
              ) : (
                <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Not yet scored
                </span>
              )}
              <Icon name={showDetails ? "chevronUp" : "chevronDown"} size={14} className="text-muted-foreground" />
            </div>
          </button>
          {showDetails && (
            <div className="border-t border-border px-4 py-3 space-y-4">
              {evalMetrics?.count != null && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">Pooled weekly R²</p>
                  <p className="text-sm font-semibold text-foreground">{formatR2(evalMetrics.r2)}</p>
                  <p className="text-xs text-muted-foreground">Across held-out variant-week totals</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">Typical error (MAE)</p>
                  <p className="text-sm font-semibold text-foreground">±{evalMetrics.mae.toFixed(2)} units/week</p>
                  <p className="text-xs text-muted-foreground">Average miss per variant week</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">RMSE</p>
                  <p className="text-sm font-semibold text-foreground">±{evalMetrics.rmse.toFixed(2)} units/week</p>
                  <p className="text-xs text-muted-foreground">Larger errors penalized</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">MSE</p>
                  <p className="text-sm font-semibold text-foreground">{evalMetrics.mse.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Mean squared error</p>
                </div>
              </div>
              )}
              {evalMetrics?.count != null ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Held-out variant-week totals across {evalMetrics.count} variants (hidden weeks, zeros included)
                    {evalMetrics.range ? ` · R² range ${(evalMetrics.range[0] * 100).toFixed(1)}–${(evalMetrics.range[1] * 100).toFixed(1)}% across evaluated hidden weeks` : ""}
                    {evalMetrics.unscored ? ` · ${evalMetrics.unscored} too new to score` : ""} · Lower is better for MAE/RMSE/MSE
                  </p>
                  {evalMetrics.naive && (() => {
                    const n = evalMetrics.naive;
                    const pct = (base, val) => base > 0 ? Math.round((1 - val / base) * 100) : 0;
                    const r2gap = n.productR2 != null && n.r2 != null ? ((n.productR2 - n.r2) * 100).toFixed(0) : null;
                    return (
                      <p className="text-xs text-muted-foreground">
                        Carry-forward baseline ({n.observations} matched variant-weeks): MAE {n.mae.toFixed(2)}/week · RMSE {n.rmse.toFixed(2)}/week · R² {formatR2(n.r2)}. Prophet error reduction: MAE {pct(n.mae, n.productMae)}%, RMSE {pct(n.rmse, n.productRmse)}% (negative means worse). R² difference: {r2gap == null ? "N/A" : `${r2gap} pts`}.
                      </p>
                    );
                  })()}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Variant evaluation is unavailable for this run. Generate a new forecast with sufficient sales history; product scores below are a separate aggregation.</p>
              )}

              {productMetrics?.count != null && <p className="text-xs text-muted-foreground">
                Aggregated product evaluation ({productMetrics.count} products, weekly totals): R² {formatR2(productMetrics.r2)} ·
                MAE {productMetrics.mae.toFixed(2)} · RMSE {productMetrics.rmse.toFixed(2)} · MSE {productMetrics.mse.toFixed(2)}.
                {productMetrics.naive && ` Matched product baseline: R² ${formatR2(productMetrics.naive.r2)} · MAE ${productMetrics.naive.mae.toFixed(2)} · RMSE ${productMetrics.naive.rmse.toFixed(2)}.`}
              </p>}
              <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                Forecast ID: {job?.id} · {forecasted.length} predicted{skipped.length ? ` · ${skipped.length} skipped; see history or error reason` : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
