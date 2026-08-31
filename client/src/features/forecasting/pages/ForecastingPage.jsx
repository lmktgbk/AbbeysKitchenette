import { useState, useEffect } from "react";
import { useDemandHistory, useDemandResults, useDemandIngredients } from "../query";
import { FilterPill } from "@/components/filters/FilterPill";
import ForecastRunButton from "../components/ForecastRunButton";
import ForecastHistory from "../components/ForecastHistory";
import ForecastChart from "../components/ForecastChart";
import DemandTable from "../components/DemandTable";
import IngredientNeeds from "../components/IngredientNeeds";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
];

/**
 * ForecastingPage - single-page demand forecast dashboard.
 *
 * States:
 *  1. Empty — no history at all, shows landing with "Run Forecast"
 *  2. Loading — fetching results, shows skeletons
 *  3. Dashboard — history exists, always shows full layout
 *     ├─ Running — progress bar
 *     ├─ Completed (has data) — chart + table + ingredients
 *     ├─ Completed (0 forecasted) — info banner + empty sections
 *     └─ Failed — error banner
 */
export default function ForecastingPage() {
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [latestJobId, setLatestJobId] = useState(null);
  const [viewPeriod, setViewPeriod] = useState("14");

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

  const handleJobComplete = (jobId) => {
    setLatestJobId(jobId);
    setSelectedJobId(jobId);
  };

  const forecasted = resultsData?.data?.forecasted || [];
  const ingredients = ingredientsData?.data?.ingredients || [];
  const job = resultsData?.data?.job;
  const skipped = resultsData?.data?.skipped || [];

  const totalUnits = forecasted.reduce((sum, v) => sum + v.total_units, 0);
  const totalRevenue = forecasted.reduce((sum, v) => sum + v.total_revenue, 0);

  const hasForecastData = forecasted.length > 0;
  const isFailed = job?.status === "failed";
  const isRunning = job?.status === "running";
  const isCompletedWithNoData = job?.status === "completed" && !hasForecastData;

  // ── State 1: Empty (no history at all) ─────────────────
  if (!historyLoading && !jobs.length) {
    return (
      <div className="flex flex-col gap-6 p-6">
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

  // ── State 2: Loading ───────────────────────────────────
  if (resultsLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card px-4 py-3">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // ── State 3: Dashboard (always shown once history exists) ─
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ForecastHistory
          history={historyData}
          currentJobId={activeJobId}
          onSelect={setSelectedJobId}
        />
        <div className="flex items-center gap-3">
          <FilterPill
            options={VIEW_OPTIONS}
            value={viewPeriod}
            onChange={setViewPeriod}
          />
          <ForecastRunButton onJobComplete={handleJobComplete} />
        </div>
      </div>

      {/* Job status banner */}
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Units</p>
          <p className="text-lg font-bold text-foreground mt-1">{totalUnits.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projected Revenue</p>
          <p className="text-lg font-bold text-foreground mt-1">&#8369;{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Variants Forecasted</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {forecasted.length}/{job?.total_variants ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skipped</p>
          <p className="text-lg font-bold text-foreground mt-1">
            {skipped.length}
            {skipped.length > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">(insufficient data)</span>
            )}
          </p>
        </div>
      </div>

      {/* Chart */}
      <ForecastChart results={forecasted} viewPeriod={Number(viewPeriod)} />

      {/* Demand Table */}
      <DemandTable results={forecasted} skipped={skipped} viewPeriod={Number(viewPeriod)} />

      {/* Ingredient Needs */}
      {!ingredientsLoading && ingredients.length > 0 && (
        <IngredientNeeds ingredients={ingredients} viewPeriod={Number(viewPeriod)} />
      )}
    </div>
  );
}
