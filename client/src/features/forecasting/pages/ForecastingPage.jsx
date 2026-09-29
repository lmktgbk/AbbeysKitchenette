import { useState, useMemo, useCallback } from "react";
import { useDemandHistory, useDemandResults, useDemandIngredients, forecastKeys } from "../query";
import { useQueryClient } from "@tanstack/react-query";
import ForecastRunButton from "../components/ForecastRunButton";
import SimpleForecastChart from "../components/SimpleForecastChart";
import ProductDemandTab from "../components/ProductDemandTab";
import IngredientOrderTab from "../components/IngredientOrderTab";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";

/**
 * ForecastingPage — friendly redesign.
 * Answers only 3 questions: Demand (To Prepare), Revenue (Expected Sales), Inventory (What to Order)
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
  const { data: ingredientsData, isLoading: ingredientsLoading } = useDemandIngredients(activeJobId);

  // Job switching clears the chart selection explicitly in handleJobComplete below —
  // no useEffect mirror needed (derived activeJobId never writes back to state).

  const handleJobComplete = useCallback((jobId) => {
    setSelectedJobId(jobId);
    setSelectedVariant(null);
    setSelectedProduct(null);
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandResults(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandIngredients(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandHistory });
  }, [queryClient]);

  const forecasted = resultsData?.data?.forecasted || [];
  const ingredients = ingredientsData?.data?.ingredients || [];
  const job = resultsData?.data?.job;
  const skipped = resultsData?.data?.skipped || [];
  const productScores = job?.product_scores || null;

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

  // Whole-menu headline over 7-DAY TOTALS (the prep decision): weekly
  // MAE/RMSE/MSE averaged per product, R2 pooled volume-weighted so one
  // freak week can't sink the mean. Daily means ride along as context.
  const evalMetrics = useMemo(() => {
    const avg = (rows, key) => {
      const vals = rows.map((f) => f[key]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const pooledR2 = (rows) => {
      const pts = rows.filter((f) => f.w_pred != null && f.w_actual != null && (f.w_pred > 0 || f.w_actual > 0));
      if (pts.length < 2) return null;
      const mean = pts.reduce((s, f) => s + f.w_actual, 0) / pts.length;
      const ssTot = pts.reduce((s, f) => s + (f.w_actual - mean) ** 2, 0);
      if (ssTot <= 0) return null;
      const ssRes = pts.reduce((s, f) => s + (f.w_actual - f.w_pred) ** 2, 0);
      return 1 - ssRes / ssTot;
    };
    const labelFor = (r2) => (r2 >= 0.8 ? "Strong" : r2 >= 0.5 ? "Moderate" : "Weak");
    if (productScores?.length) {
      const weekly = productScores.filter((f) => f.w_pred != null && (f.w_pred > 0 || f.w_actual > 0));
      const r2 = pooledR2(productScores) ?? avg(productScores, "r_squared") ?? 0;
      return {
        r2, mae: avg(weekly, "w_mae") ?? avg(productScores, "mae") ?? 0,
        rmse: avg(weekly, "w_rmse") ?? avg(productScores, "rmse") ?? 0,
        mse: avg(weekly, "w_mse") ?? avg(productScores, "mse") ?? 0,
        count: productScores.length, label: labelFor(r2),
        dailyMae: avg(productScores, "mae"),
        unscored: 0,
      };
    }
    if (!forecasted.length) return null;
    const scored = forecasted.filter((f) => f.r_squared != null && f.mae != null);
    if (!scored.length) return { unscored: forecasted.length };
    const r2 = avg(scored, "r_squared") ?? 0;
    return {
      r2, mae: avg(scored, "mae") ?? 0,
      rmse: avg(scored, "rmse") ?? 0, mse: avg(scored, "mse") ?? 0,
      count: scored.length, label: labelFor(r2),
      dailyMae: null,
      unscored: forecasted.length - scored.length,
    };
  }, [productScores, forecasted]);

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
            See how many to prepare, how much you’ll sell, and what to order — based on your past sales.
          </p>
          <div className="mt-6 flex justify-center">
            <ForecastRunButton onJobComplete={handleJobComplete} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Usually about a minute. Stay on this page — progress shows on the button. Needs at least 7 days of sales to predict.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header + plain summary */}
      <div className="rounded-xl border border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-foreground">Demand Forecast for 7 Days</h1>
            {!hasData ? (
              <p className="mt-1 text-sm text-muted-foreground">No predictions yet — tap Update Forecast to generate.</p>
            ) : null}
            {lastUpdated && <p className="mt-1 text-xs text-muted-foreground">Last updated: {lastUpdated}</p>}
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
            <p className="text-xs text-amber-800 dark:text-amber-300">Need more sales — sell at least 7 days before we can predict. {skipped.length} products waiting.</p>
          </div>
        )}
      </div>

      {/* 3 KPI Cards */}
      {hasData && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Demand — Items to Prepare</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{periodTotals.units.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total forecast for 7 days · avg {Math.round(periodTotals.units/7)} items/day</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expected Sales</p>
            <p className="mt-1 text-2xl font-bold text-foreground">₱{periodTotals.revenue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total for 7 days · avg ₱{Math.round(periodTotals.revenue/7).toLocaleString()}/day</p>
          </div>
          <div className={`rounded-xl border px-5 py-4 ${lowIngredients.length ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/10" : "border-border bg-card"}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What to Order</p>
            {lowIngredients.length ? (
              <>
                <p className="mt-1 text-2xl font-bold text-amber-700">{lowIngredients.length} low</p>
                <p className="text-xs text-muted-foreground truncate">{topNeed.map((i)=> i.name).join(", ")}{lowIngredients.length > 3 ? ` +${lowIngredients.length-3} more` : ""}</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-2xl font-bold text-green-700">All good</p>
                <p className="text-xs text-muted-foreground">No urgent orders</p>
              </>
            )}
          </div>
        </div>
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

      {/* Evaluation — clean card, matches KPI/Chart style */}
      {hasData && evalMetrics && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button onClick={() => setShowDetails(!showDetails)} className="flex w-full items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
            <div className="text-left">
              <h3 className="text-sm font-semibold text-foreground">Model Evaluation</h3>
              <p className="text-xs text-muted-foreground">How accurate is this forecast?</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {evalMetrics.count != null ? (
                <>
                  <span title="R-squared — how well the model fits past sales" className={`hidden sm:inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${evalMetrics.label==="Strong" ? "bg-green-100 text-green-700 border-green-200" : evalMetrics.label==="Moderate" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                    Fit {(evalMetrics.r2*100).toFixed(1)}% · {evalMetrics.label}
                  </span>
                  <span title="Mean Absolute Error — typical weekly miss per product" className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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
              {evalMetrics.count != null && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">Fit (R²)</p>
                  <p className="text-sm font-semibold text-foreground">{(evalMetrics.r2*100).toFixed(1)}% <span className={`ml-1 rounded-full border px-1.5 py-0.5 text-xs ${evalMetrics.label==="Strong" ? "bg-green-100 text-green-700 border-green-200" : evalMetrics.label==="Moderate" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-red-100 text-red-700 border-red-200"}`}>{evalMetrics.label}</span></p>
                  <p className="text-xs text-muted-foreground">How well it fits past sales</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">Typical error (MAE)</p>
                  <p className="text-sm font-semibold text-foreground">±{evalMetrics.mae.toFixed(2)} units/week</p>
                  <p className="text-xs text-muted-foreground">Average miss per product week</p>
                </div>
                <div className="rounded-lg border border-border bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">Worst-case (RMSE)</p>
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
              {evalMetrics.count != null ? (
                <p className="text-xs text-muted-foreground">
                  Whole-menu 7-day-total average across {evalMetrics.count} products (hidden week, zeros included)
                  {evalMetrics.unscored ? ` · ${evalMetrics.unscored} too new to score` : ""} · Lower is better for MAE/RMSE/MSE
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Not enough history to score yet — forecasts below still show for prep. Scores appear once a product has 14+ days.</p>
              )}

              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <h4 className="text-xs font-semibold text-foreground">How it was modeled</h4>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><dt className="text-muted-foreground">Model</dt><dd className="font-medium text-foreground">Prophet additive + PH holidays</dd></div>
                  <div><dt className="text-muted-foreground">Patterns</dt><dd className="font-medium text-foreground">Weekly (+ yearly past 180 days)</dd></div>
                  <div><dt className="text-muted-foreground">Level</dt><dd className="font-medium text-foreground">One model per product, split to sizes</dd></div>
                  <div><dt className="text-muted-foreground">Size split</dt><dd className="font-medium text-foreground">Trailing-30-day share, totals preserved</dd></div>
                  <div><dt className="text-muted-foreground">Training window</dt><dd className="font-medium text-foreground">All history, full calendar (missing = 0)</dd></div>
                  <div><dt className="text-muted-foreground">Scoring</dt><dd className="font-medium text-foreground">Hidden 7-day week, totals + daily, zeros in</dd></div>
                  <div><dt className="text-muted-foreground">Forecast</dt><dd className="font-medium text-foreground">Next 7 days</dd></div>
                  <div><dt className="text-muted-foreground">Confidence</dt><dd className="font-medium text-foreground">90% interval</dd></div>
                </dl>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">We group items sold per product per day, fill missing days with 0 (zeros are true demand), fit one Prophet model per product, split each day across sizes by recent share, and score RMSE/MAE/MSE/R² on a hidden 7-day tail at 7-day-total level (the prep decision). Per-product R² is bounded below at −1 so one freak bulk week can't sink the menu mean; headline R² is volume-weighted across products. Revenue uses real size prices; ingredients use real size recipes.</p>
              </div>

              <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                Forecast ID: {job?.id} · {forecasted.length} predicted{skipped.length ? ` · ${skipped.length} need more sales (≥7 days)` : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
