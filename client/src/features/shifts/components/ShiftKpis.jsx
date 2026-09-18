import { Skeleton } from "@/components/ui/skeleton";
import { formatPeso, formatVariance } from "@/lib/money";
import { useShiftStats } from "../query";

/**
 * ShiftKpis
 *
 * Shifts-view summary cards. Same chrome as the module KpiCards so the
 * row feels native when the Staff view switches.
 * Labels follow the selected range ("today" by default).
 */
export default function ShiftKpis({ params = {} }) {
  const { data, isLoading, error } = useShiftStats(params);
  const stats = data?.data?.stats ?? null;

  if (isLoading || error || !stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const off = Number(stats.offCount ?? 0);
  const variance = Number(stats.varianceTotal ?? 0);
  const ranged = !!(params.date_from || params.date_to);
  const period = ranged ? "selected period" : "today";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${Number(stats.openNow) > 0 ? "bg-green-500" : "bg-muted-foreground/30"}`} />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open now</p>
          <p className="text-lg font-bold text-foreground">{Number(stats.openNow ?? 0)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sessions · {period}</p>
          <p className="text-lg font-bold text-foreground">{Number(stats.sessions ?? 0)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cash sales · {period}</p>
          <p className="text-lg font-bold text-foreground">{formatPeso(stats.cashSales)}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Difference · {period}</p>
          <p className={`text-lg font-bold ${variance === 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
            {formatVariance(variance)}
          </p>
          {off > 0 && (
            <p className="text-[11px] text-muted-foreground">{off} shift{off === 1 ? "" : "s"} off</p>
          )}
        </div>
      </div>
    </div>
  );
}
