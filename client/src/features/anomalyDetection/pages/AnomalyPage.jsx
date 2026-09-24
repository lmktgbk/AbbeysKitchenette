/**
 * AnomalyPage — anomaly inbox with severity/category filters + acknowledge/scan actions.
 * WHY it exists: surfaces unusual sales/waste/ops findings for admin triage.
 * Query keys consumed: ["anomalies","results",params] via useAnomalyResults,
 * ["anomalies","stats"] via useAnomalyStats. Guards: admin-only route; no BR-02 shift gate.
 * State: Query [resultsData, statsData] | local [severity, category, page, pageSize] | Zustand [].
 */
import { useState, useMemo } from "react";
import { useAnomalyResults, useAnomalyStats, useAcknowledgeAnomaly, useTriggerScan } from "../query";
import AnomalyFilters from "../components/AnomalyFilters";
import AnomalyList from "../components/AnomalyList";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function AnomalyPage() {
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const queryParams = useMemo(() => {
    const params = { page, limit: pageSize };
    if (severity) params.severity = severity;
    if (category) params.category = category;
    return params;
  }, [page, pageSize, severity, category]);

  const { data: resultsData, isLoading: resultsLoading } = useAnomalyResults(queryParams);
  const { data: statsData, isLoading: statsLoading } = useAnomalyStats();
  const acknowledgeMutation = useAcknowledgeAnomaly();
  const scanMutation = useTriggerScan();

  const anomalies = resultsData?.data?.results || [];
  const totalItems = resultsData?.data?.totalItems || 0;
  const stats = statsData?.data || {};
  const total = stats.total ?? 0;
  const critical = stats.bySeverity?.critical ?? 0;

  function handleAcknowledge(id) {
    acknowledgeMutation.mutate(id);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with merged status — single card on top in all states */}
      <div className="rounded-xl border border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${statsLoading || total === 0 ? "bg-green-500/10" : critical > 0 ? "bg-red-500/10" : "bg-amber-500/10"}`}>
              <Icon
                name={statsLoading || total === 0 ? "checkCircle" : "alertTriangle"}
                size={18}
                className={statsLoading || total === 0 ? "text-green-600 dark:text-green-400" : critical > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-base text-muted-foreground">
                Anomalies:{" "}
                {statsLoading ? (
                  <span className="font-semibold text-foreground">…</span>
                ) : total === 0 ? (
                  <span className="font-semibold text-green-600 dark:text-green-400">All good</span>
                ) : (
                  <span className="font-semibold text-foreground">{total} Need Attention</span>
                )}
              </h1>
            {!statsLoading && total > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {critical > 0 && (
                  <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                    {critical} urgent
                  </span>
                )}
                {(total - critical) > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {total - critical} to watch
                  </span>
                )}
              </div>
            )}
            {stats.lastScan ? (
              <p className="mt-1 text-xs text-muted-foreground">Last scan: {new Date(stats.lastScan).toLocaleString()}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Unusual sales, waste and operations</p>
            )}
            </div>
          </div>
          <div className="shrink-0">
            <Button size="sm" variant="primary" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              {scanMutation.isPending ? "Checking..." : "Check now"}
            </Button>
          </div>
        </div>
      </div>

      {/* Empty body — only when truly zero */}
      {!statsLoading && total === 0 && (
        <div className="rounded-xl border border-border bg-card px-6 py-5 text-center">
          <Icon name="checkCircle" size={28} className="mx-auto text-green-600" />
          <p className="mt-2 text-base font-semibold text-foreground">All good</p>
          <p className="text-xs text-muted-foreground">Nothing unusual found</p>
        </div>
      )}

      {/* Filters — hidden when zero total and no filter active */}
      {(total > 0 || severity || category) && (
        <AnomalyFilters
          severity={severity}
          category={category}
          onSeverityChange={(v) => { setSeverity(v); setPage(1); }}
          onCategoryChange={(v) => { setCategory(v); setPage(1); }}
        />
      )}

      {resultsLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card border-l-4 border-l-muted p-4">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {!resultsLoading && anomalies.length > 0 && (
        <AnomalyList
          anomalies={anomalies}
          totalItems={totalItems}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onAcknowledge={handleAcknowledge}
        />
      )}

      {!resultsLoading && anomalies.length === 0 && total > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
          <Icon name="checkCircle" size={32} className="mx-auto mb-3 text-green-500" />
          <p className="text-sm font-medium text-foreground">No anomalies here</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different filter or check again later.</p>
        </div>
      )}
    </div>
  );
}
