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
      {/* Header — like Promotions */}
      <div className="rounded-xl border border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-foreground">Anomalies</h1>
            {stats.lastScan ? (
              <p className="mt-1 text-xs text-muted-foreground">Last scan: {new Date(stats.lastScan).toLocaleString()}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Unusual sales, waste and operations</p>
            )}
          </div>
          <div className="shrink-0">
            <Button size="sm" variant="outline" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
              {scanMutation.isPending ? "Checking..." : "Check now"}
            </Button>
          </div>
        </div>
      </div>

      {/* Hero — All good or needs attention */}
      {!statsLoading && (
        total === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-5 text-center">
            <Icon name="checkCircle" size={28} className="mx-auto text-green-600" />
            <p className="mt-2 text-base font-semibold text-foreground">All good</p>
            <p className="text-xs text-muted-foreground">Nothing unusual found</p>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50/30 px-6 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">{total} need attention</p>
            <p className="mt-1 text-sm text-muted-foreground">{critical > 0 ? `${critical} urgent` : "Review below when you have time"}</p>
          </div>
        )
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
