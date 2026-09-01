import { useState, useEffect, useMemo, useCallback } from "react";
import { useDemandHistory, useDemandResults, useDemandIngredients, forecastKeys } from "../query";
import { useQueryClient } from "@tanstack/react-query";
import ForecastRunButton from "../components/ForecastRunButton";
import ForecastHistory from "../components/ForecastHistory";
import ForecastChart from "../components/ForecastChart";
import ForecastSidebar from "../components/ForecastSidebar";
import DemandTable from "../components/DemandTable";
import IngredientNeeds from "../components/IngredientNeeds";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";

/**
 * ForecastingPage - demand forecast dashboard.
 *
 * Layout (top to bottom):
 *  1. KPI Cards (always aggregate)
 *  2. History tabs + Run Forecast button
 *  3. Daily Forecast chart (full width, with variant selector)
 *  4. Two-column: Demand Table + Sidebar
 *  5. Ingredient Needs (full width, always aggregate)
 *
 * States:
 *  A. Empty — no history at all
 *  B. Loading — fetching results
 *  C. Dashboard — full layout
 */
export default function ForecastingPage() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [latestJobId, setLatestJobId] = useState(null);
  const [viewPeriod, setViewPeriod] = useState("7");
  const [selectedVariant, setSelectedVariant] = useState("all");

  const { data: historyData, isLoading: historyLoading } = useDemandHistory();
  const { data: resultsData, isLoading: resultsLoading } = useDemandResults(selectedJobId);
  const { data: ingredientsData, isLoading: ingredientsLoading } = useDemandIngredients(selectedJobId);

  const jobs = historyData?.data?.jobs || [];
  const activeJobId = selectedJobId || latestJobId || jobs[0]?.id || null;

  useEffect(() => {
    if (jobs.length && !selectedJobId && !latestJobId) {
      setSelectedJobId(jobs[0].id);
    }
  }, [jobs, selectedJobId, latestJobId]);

  const handleJobComplete = useCallback((jobId) => {
    setLatestJobId(jobId);
    setSelectedJobId(jobId);
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandResults(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandIngredients(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandHistory });
  }, [queryClient]);

  const forecasted = resultsData?.data?.forecasted || [];
  const ingredients = ingredientsData?.data?.ingredients || [];
  const job = resultsData?.data?.job;
  const skipped = resultsData?.data?.skipped || [];

  const isJobCompleted = job?.status === "completed";
  const isJobFailed = job?.status === "failed";
  const showLoading = resultsLoading && !isJobCompleted && !isJobFailed;

  // Reset variant filter when job changes
  useEffect(() => {
    setSelectedVariant("all");
  }, [activeJobId]);

  // ── KPI computations (always aggregate, filtered by viewPeriod) ──
  const periodTotals = useMemo(() => {
    if (!forecasted.length) return { units: 0, revenue: 0 };
    return forecasted.reduce(
      (acc, v) => {
        const sliced = v.daily_data.slice(0, Number(viewPeriod));
        return {
          units: acc.units + sliced.reduce((s, d) => s + d.units, 0),
          revenue: acc.revenue + sliced.reduce((s, d) => s + d.revenue, 0),
        };
      },
      { units: 0, revenue: 0 }
    );
  }, [forecasted, viewPeriod]);

  const topSeller = useMemo(() => {
    if (!forecasted.length) return null;
    let best = null;
    let bestUnits = 0;
    for (const v of forecasted) {
      const units = v.daily_data.slice(0, Number(viewPeriod)).reduce((s, d) => s + d.units, 0);
      if (units > bestUnits) {
        bestUnits = units;
        best = v;
      }
    }
    return best;
  }, [forecasted, viewPeriod]);

  // Variant name for the drill-down banner
  const selectedVariantName = useMemo(() => {
    if (!selectedVariant || selectedVariant === "all") return null;
    const v = forecasted.find((f) => String(f.variant_id) === String(selectedVariant));
    return v ? `${v.product_name} (${v.size_name})` : null;
  }, [selectedVariant, forecasted]);

  const comparisonJobId = useMemo(() => {
    if (!jobs.length || jobs.length < 2) return null;
    const activeIdx = jobs.findIndex((j) => j.id === activeJobId);
    const comparisonIdx = activeIdx === 0 ? 1 : 0;
    return jobs[comparisonIdx]?.id ?? null;
  }, [jobs, activeJobId]);

  const { data: comparisonData } = useDemandResults(comparisonJobId);
  const previousResults = comparisonData?.data?.forecasted || [];

  const formatJobLabel = (jobId) => {
    const j = jobs.find((job) => job.id === jobId);
    if (!j) return "";
    const label = j === jobs[0] ? "Current" : "Previous";
    const date = j.completed_at
      ? new Date(j.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    return `${label} (${date})`;
  };

  const activeJobLabel = formatJobLabel(activeJobId);
  const comparisonJobLabel = comparisonJobId ? formatJobLabel(comparisonJobId) : null;

  const hasForecastData = forecasted.length > 0;
  const isFailed = job?.status === "failed";
  const isCompletedWithNoData = job?.status === "completed" && !hasForecastData;

  // ── State 0: Initial loading (history still fetching) ─
  if (historyLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // ── State A: Empty ──────────────────────────────────
  if (!jobs.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Icon name="barChart2" size={48} className="mx-auto text-muted-foreground/30" />
          <h2 className="mt-4 text-base font-semibold text-foreground">Demand Forecasting</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Predict unit demand per product variant for the next 14 days using historical sales data.
          </p>
          <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Icon name="trendingUp" size={14} className="text-muted-foreground/50" />
              <span>Daily unit demand</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon name="dollarSign" size={14} className="text-muted-foreground/50" />
              <span>Revenue projections</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon name="package" size={14} className="text-muted-foreground/50" />
              <span>Ingredient requirements</span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <ForecastRunButton onJobComplete={handleJobComplete} />
          </div>
        </div>
      </div>
    );
  }

  // ── State B: Loading ────────────────────────────────
  if (showLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // ── State C: Dashboard ──────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* ① KPI Cards — always aggregate, filtered by viewPeriod */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Units</p>
          <p className="text-lg font-bold text-foreground mt-1">{periodTotals.units.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projected Revenue</p>
          <p className="text-lg font-bold text-foreground mt-1">₱{periodTotals.revenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Forecasted</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {forecasted.length}/{job?.total_variants ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skipped</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {skipped.length}
            {skipped.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">(data)</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top Seller</p>
          <p className="text-lg font-bold text-foreground mt-1 truncate">
            {topSeller ? topSeller.product_name : "—"}
          </p>
          {topSeller && (
            <p className="text-xs text-muted-foreground truncate">
              {topSeller.size_name}
            </p>
          )}
        </div>
      </div>

      {/* ② Job status banners */}
      {isFailed && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <Icon name="alertCircle" size={16} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Forecast failed</p>
            <p className="text-sm text-muted-foreground">
              {job.error_message || "An error occurred during forecasting."}
              {" "}Click "Run Forecast" to try again.
            </p>
          </div>
        </div>
      )}

      {isCompletedWithNoData && skipped.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              No forecastable variants
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              All {skipped.length} variant{skipped.length !== 1 ? "s were" : " was"} skipped — they need at least
              7 days of completed order history to generate predictions. Complete more orders to enable
              forecasting.
            </p>
          </div>
        </div>
      )}

      {/* ③ Controls row: History tabs (left) + Run Forecast (right) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ForecastHistory
          history={historyData}
          currentJobId={activeJobId}
          onSelect={setSelectedJobId}
        />
        <ForecastRunButton onJobComplete={handleJobComplete} />
      </div>

      {/* ④ Variant drill-down banner */}
      {selectedVariantName && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <Icon name="filter" size={14} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Viewing: <span className="font-medium text-foreground">{selectedVariantName}</span>
          </span>
          <button
            onClick={() => setSelectedVariant("all")}
            className="ml-1 text-xs font-medium text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* ⑤ Daily Forecast chart — full width, with variant selector + period filter */}
      <ForecastChart
        results={forecasted}
        previousResults={previousResults}
        viewPeriod={Number(viewPeriod)}
        onViewPeriodChange={setViewPeriod}
        selectedVariant={selectedVariant}
        onVariantChange={setSelectedVariant}
        activeJobLabel={activeJobLabel}
        comparisonJobLabel={comparisonJobLabel}
      />

      {/* ⑥ Two-column: Demand Table + Sidebar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] items-start">
        <DemandTable
          results={forecasted}
          skipped={skipped}
          previousResults={previousResults}
          viewPeriod={Number(viewPeriod)}
          selectedVariant={selectedVariant}
        />
        <ForecastSidebar
          forecasted={forecasted}
          skipped={skipped}
          viewPeriod={Number(viewPeriod)}
        />
      </div>

      {/* ⑦ Ingredient Needs — full width, always aggregate */}
      {!ingredientsLoading && ingredients.length > 0 && (
        <IngredientNeeds ingredients={ingredients} />
      )}
    </div>
  );
}
