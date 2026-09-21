import { useState, useEffect, useMemo, useCallback } from "react";
import { useDemandHistory, useDemandResults, useDemandIngredients, forecastKeys } from "../query";
import { useQueryClient } from "@tanstack/react-query";
import ForecastRunButton from "../components/ForecastRunButton";
import SimpleForecastChart from "../components/SimpleForecastChart";
import ProductDemandTab from "../components/ProductDemandTab";
import IngredientOrderTab from "../components/IngredientOrderTab";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";
import { FilterPill } from "@/components/filters/FilterPill";

/**
 * ForecastingPage — friendly redesign.
 * Answers only 3 questions: Demand (To Prepare), Revenue (Expected Sales), Inventory (What to Order)
 * Plain language, 3 KPI cards + combined chart + tabbed details. Tech behind Details flap.
 */
export default function ForecastingPage() {
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [activeTab, setActiveTab] = useState("products");
  const [showDetails, setShowDetails] = useState(false);

  const { data: historyData, isLoading: historyLoading } = useDemandHistory();
  const { data: resultsData, isLoading: resultsLoading } = useDemandResults(selectedJobId);
  const { data: ingredientsData, isLoading: ingredientsLoading } = useDemandIngredients(selectedJobId);

  const jobs = historyData?.data?.jobs || [];
  const activeJobId = selectedJobId || jobs[0]?.id || null;

  useEffect(() => {
    if (jobs.length && !selectedJobId) setSelectedJobId(jobs[0].id);
  }, [jobs, selectedJobId]);

  const handleJobComplete = useCallback((jobId) => {
    setSelectedJobId(jobId);
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandResults(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandIngredients(jobId) });
    queryClient.invalidateQueries({ queryKey: forecastKeys.demandHistory });
  }, [queryClient]);

  const forecasted = resultsData?.data?.forecasted || [];
  const ingredients = ingredientsData?.data?.ingredients || [];
  const job = resultsData?.data?.job;
  const skipped = resultsData?.data?.skipped || [];

  const periodTotals = useMemo(() => {
    if (!forecasted.length) return { units: 0, revenue: 0 };
    return forecasted.reduce((acc, v) => ({
      units: acc.units + v.daily_data.slice(0, 7).reduce((s, d) => s + d.units, 0),
      revenue: acc.revenue + v.daily_data.slice(0, 7).reduce((s, d) => s + d.revenue, 0),
    }), { units: 0, revenue: 0 });
  }, [forecasted]);

  const lowIngredients = useMemo(() => ingredients.filter((i) => i.status !== "ok"), [ingredients]);
  const topNeed = useMemo(() => [...lowIngredients].sort((a,b)=> a.status.localeCompare(b.status)).slice(0,2), [lowIngredients]);

  const lastUpdated = job?.completed_at ? new Date(job.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  const hasData = forecasted.length > 0;
  const isFailed = job?.status === "failed";
  const showLoading = resultsLoading && !job;

  const evalMetrics = useMemo(() => {
    if (!forecasted.length) return null;
    const withM = forecasted.filter((f) => f.r_squared != null);
    if (!withM.length) return null;
    const avg = (key) => {
      const vals = withM.map((f) => f[key]).filter((v) => v != null && v !== 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const r2 = avg("r_squared");
    const label = r2 >= 0.8 ? "Strong" : r2 >= 0.5 ? "Moderate" : "Weak";
    return {
      r2, mae: avg("mae"), rmse: avg("rmse"),
      count: withM.length, label,
    };
  }, [forecasted]);

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
          <p className="mt-3 text-xs text-muted-foreground">Takes ~30 seconds. Needs at least 7 days of sales to predict.</p>
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
            <h1 className="text-base font-semibold text-foreground">Sales Forecast — Next 7 Days</h1>
            {hasData ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Prepare <span className="font-semibold text-foreground">~{periodTotals.units.toLocaleString()} servings</span>
                {" · "}Expect <span className="font-semibold text-foreground">~₱{periodTotals.revenue.toLocaleString()} sales</span>
                {lowIngredients.length > 0 ? (
                  <>{" · "}Order <span className="font-semibold text-amber-700">{lowIngredients.length} items</span>{topNeed.length ? ` (${topNeed.map((i)=> `${i.name} ${i.total_needed}${i.unit}`).join(", ")})` : ""}</>
                ) : (
                  <>{" · "}Stock looks good</>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No predictions yet — tap Update Forecast to generate.</p>
            )}
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
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To Prepare</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{periodTotals.units.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">servings next 7 days · ~{Math.round(periodTotals.units/7)}/day</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expected Sales</p>
            <p className="mt-1 text-2xl font-bold text-foreground">₱{periodTotals.revenue.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">next 7 days · ~₱{Math.round(periodTotals.revenue/7).toLocaleString()}/day</p>
          </div>
          <div className={`rounded-xl border px-5 py-4 ${lowIngredients.length ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/10" : "border-border bg-card"}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What to Order</p>
            {lowIngredients.length ? (
              <>
                <p className="mt-1 text-2xl font-bold text-amber-700">{lowIngredients.length} low</p>
                <p className="text-xs text-muted-foreground truncate">{topNeed.map((i)=> i.name).join(", ")}{lowIngredients.length > 2 ? ` +${lowIngredients.length-2} more` : ""}</p>
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

      {/* Combined 7-Day Plan Chart */}
      {hasData && <SimpleForecastChart results={forecasted} isLoading={ingredientsLoading} />}

      {/* Tabs: By Product / By Ingredient */}
      {hasData && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FilterPill
              options={[
                { value: "products", label: "By Product" },
                { value: "ingredients", label: "By Ingredient" },
              ]}
              value={activeTab}
              onChange={setActiveTab}
            />
            <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">Tap to see details</span>
          </div>
          {activeTab === "products" ? (
            <ProductDemandTab results={forecasted} />
          ) : (
            <IngredientOrderTab ingredients={ingredients} />
          )}
        </div>
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
              <span className={`hidden sm:inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${evalMetrics.label==="Strong" ? "bg-green-100 text-green-700 border-green-200" : evalMetrics.label==="Moderate" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                R² {(evalMetrics.r2*100).toFixed(1)}% · {evalMetrics.label}
              </span>
              <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                off by ~{evalMetrics.mae.toFixed(1)}/day
              </span>
              <Icon name={showDetails ? "chevronUp" : "chevronDown"} size={14} className="text-muted-foreground" />
            </div>
          </button>
          {showDetails && (
            <div className="border-t border-border px-4 py-3 space-y-3">
              <div className="flex flex-wrap gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground">Accuracy</span>
                  <span className="font-semibold text-foreground">{(evalMetrics.r2*100).toFixed(1)}%</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${evalMetrics.label==="Strong" ? "bg-green-100 text-green-700 border-green-200" : evalMetrics.label==="Moderate" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-red-100 text-red-700 border-red-200"}`}>{evalMetrics.label}</span>
                </span>
                <span><span className="text-muted-foreground">Avg Error</span> <span className="font-medium text-foreground">±{evalMetrics.mae.toFixed(1)} units/day</span></span>
                <span><span className="text-muted-foreground">Worst-case</span> <span className="font-medium text-foreground">±{evalMetrics.rmse.toFixed(1)} units/day</span></span>
                <span className="text-muted-foreground">Average across {evalMetrics.count} products</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Prophet additive (weekly+yearly, changepoint 0.1) · trained on 30d calendar (zeros = no sale) · Lower error = more reliable · Based on last 30 days sales · Refresh weekly.
              </p>
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
