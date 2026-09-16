import { useState, useMemo } from "react";
import { useAnomalyResults, useAnomalyStats, useAcknowledgeAnomaly } from "../query";
import AnomalyFilters from "../components/AnomalyFilters";
import AnomalyList from "../components/AnomalyList";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnomalyPage() {
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const queryParams = useMemo(() => {
    const params = { page, limit: pageSize };
    if (severity) params.severity = severity;
    if (category) params.category = category;
    return params;
  }, [page, pageSize, severity, category]);

  const { data: resultsData, isLoading: resultsLoading } = useAnomalyResults(queryParams);
  const { data: statsData, isLoading: statsLoading } = useAnomalyStats();
  const acknowledgeMutation = useAcknowledgeAnomaly();

  const anomalies = resultsData?.data?.results || [];
  const totalItems = resultsData?.data?.totalItems || 0;
  const stats = statsData?.data || {};

  function handleAcknowledge(id) {
    acknowledgeMutation.mutate(id);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Anomalies</h1>
          {stats.lastScan && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Last scan: {new Date(stats.lastScan).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Anomalies Found
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {statsLoading ? <Skeleton className="h-6 w-12" /> : stats.total ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Critical
          </p>
          <p className={`mt-1 text-lg font-bold ${(stats.bySeverity?.critical || 0) > 0 ? "text-red-500" : "text-foreground"}`}>
            {statsLoading ? <Skeleton className="h-6 w-12" /> : stats.bySeverity?.critical ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            High
          </p>
          <p className={`mt-1 text-lg font-bold ${(stats.bySeverity?.high || 0) > 0 ? "text-amber-500" : "text-foreground"}`}>
            {statsLoading ? <Skeleton className="h-6 w-12" /> : stats.bySeverity?.high ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Medium
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {statsLoading ? <Skeleton className="h-6 w-12" /> : stats.bySeverity?.medium ?? 0}
          </p>
        </div>
      </div>

      {/* Filters */}
      <AnomalyFilters
        severity={severity}
        category={category}
        onSeverityChange={(v) => { setSeverity(v); setPage(1); }}
        onCategoryChange={(v) => { setCategory(v); setPage(1); }}
      />

      {/* Loading */}
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

      {/* Results */}
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

      {/* Empty State */}
      {!resultsLoading && anomalies.length === 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
          <Icon name="checkCircle" size={32} className="mx-auto mb-3 text-green-500" />
          <p className="text-sm font-medium text-foreground">No anomalies detected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your system is running normally. Next scan: tomorrow at 6:00 AM.
          </p>
        </div>
      )}
    </div>
  );
}
