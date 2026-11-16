import { formatPeso } from "@/lib/money";
import { formatDemand } from "../formatDemand";
import { useState, useMemo, useCallback } from "react";
import { useDemandHistory, useDemandResults, useDemandIngredients, forecastKeys } from "../query";
import { useQueryClient } from "@tanstack/react-query";
import ForecastRunButton from "../components/ForecastRunButton";
import SimpleForecastChart from "../components/SimpleForecastChart";
import ProductDemandTab from "../components/ProductDemandTab";
import IngredientOrderTab from "../components/IngredientOrderTab";
import { Skeleton } from "@/components/ui/skeleton";
import { StatLabel, StatValue, StatSub } from "@/components/ui/stat";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

/** Undefined scores must remain visibly unavailable rather than becoming 0%. */
/**
 * ForecastingPage — friendly redesign.
 * Answers only 3 questions: Demand (Expected Units), Revenue (Expected Sales), Inventory (What to Order)
 * Plain language, 3 KPI cards + combined chart + tabbed details. Tech behind Details flap.
 *
 * State (Rule of Thumb):
 * - API data via TanStack Query: jobs history, demand results + ingredients keyed by activeJobId.
 * - Browser-only via useState: selectedJobId override, activeTab, selectedVariant.
 * - activeJobId is DERIVED (selected ?? first job) — never mirrored back into state via effect,
 *   so first paint selects without a null-first fetch or double skeleton.
 */
export default function ForecastingPage() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [activeTab, setActiveTab] = useState("products");
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const { data: historyData, isLoading: historyLoading, isError: historyError, refetch: retryHistory } = useDemandHistory();
  const jobs = historyData?.data?.jobs || [];
  const activeJobId = selectedJobId ?? jobs[0]?.id ?? null;

  const { data: resultsData, isLoading: resultsLoading, isError: resultsError, refetch: retryResults } = useDemandResults(activeJobId);
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
  // Historical saved runs keep their original rounded quantities and scores.
  const expectedDemand = productScores?.some((score) => ["variant_prophet_expected", "variant_prophet_expected_flat"].includes(score.forecast_method));

  const periodTotals = useMemo(() => {
    if (!forecasted.length) return { units: 0, revenue: 0 };
    return forecasted.reduce((acc, v) => ({
      units: acc.units + v.daily_data.slice(0, 7).reduce((s, d) => s + d.units, 0),
      revenue: acc.revenue + v.daily_data.slice(0, 7).reduce((s, d) => s + d.revenue, 0),
    }), { units: 0, revenue: 0 });
  }, [forecasted]);

  const lowIngredients = useMemo(() => ingredients.filter((i) => ["critical", "warning"].includes(i.status) && Number(i.total_needed || 0) > 0.01), [ingredients]);
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

  // Failed reads are not evidence of an empty forecast. Retry the saved result, not model training.
  if (historyError || resultsError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-card p-6" role="alert">
        <h1 className="text-base font-semibold text-foreground">Could not load forecast</h1>
        <p className="mt-2 text-sm text-muted-foreground">The forecast service could not return the saved results. Try loading them again, generating another forecast is not required to retry.</p>
        <Button className="mt-4" onClick={() => historyError ? retryHistory() : retryResults()}>Retry loading</Button>
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

      {/* 3 KPI Cards */}
      {hasData && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-border bg-card p-5">
            <StatLabel>Demand — Expected Demand</StatLabel>
            <StatValue size="hero" className="mt-1">{formatDemand(periodTotals.units)}</StatValue>
            <StatSub>Total forecast for 7 days · avg {formatDemand(periodTotals.units / 7)} items/day</StatSub>
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
                <StatSub className="block whitespace-normal break-words">{topNeed.map((i) => i.name).join(", ")}{lowIngredients.length > 3 ? ` +${lowIngredients.length - 3} more` : ""}</StatSub>
              </>
            ) : (
              <>
                <StatValue size="hero" className="mt-1 text-green-700 dark:text-green-400">{ingredientIncomplete ? "Review needed" : "All good"}</StatValue>
                <StatSub className="block whitespace-normal break-words">{ingredientIncomplete ? "Ingredient demand incomplete; review forecast coverage and recipes" : "No urgent orders"}</StatSub>
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
      {hasData && (
        <p className="text-xs text-muted-foreground">
          Forecast ID: {job?.id} · {forecasted.length} predicted{skipped.length ? ` · ${skipped.length} skipped; see history or error reason` : ""}
        </p>
      )}
    </div>
  );
}
