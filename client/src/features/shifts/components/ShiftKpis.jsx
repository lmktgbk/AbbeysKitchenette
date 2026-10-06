import { Skeleton } from "@/components/ui/skeleton";
import { StatLabel, StatValue, StatSub } from "@/components/ui/stat";
import { formatPeso, formatVariance } from "@/lib/money";
import { useShiftStats } from "../query";
import { toLocalDate } from "@/lib/date";

/**
 * ShiftKpis
 *
 * Shifts-view summary cards. Same chrome as the module KpiCards so the
 * row feels native when the Staff view switches.
 * Labels follow the same date bounds as the history query; empty bounds mean all time.
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
  const { date_from: from, date_to: to } = params;
  const period = !from && !to ? "all time"
    : from === to ? (from === toLocalDate(new Date()) ? "today" : from)
    : from && to ? `${from} – ${to}`
    : from ? `since ${from}` : `through ${to}`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${Number(stats.openNow) > 0 ? "bg-green-500" : "bg-muted-foreground/30"}`} />
        <div className="min-w-0">
          <StatLabel>Open now</StatLabel>
          <StatValue>{Number(stats.openNow ?? 0)}</StatValue>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <StatLabel>Sessions · {period}</StatLabel>
          <StatValue>{Number(stats.sessions ?? 0)}</StatValue>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <StatLabel>Cash sales · {period}</StatLabel>
          <StatValue>{formatPeso(stats.cashSales)}</StatValue>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <StatLabel>Difference · {period}</StatLabel>
          <StatValue className={variance === 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
            {formatVariance(variance)}
          </StatValue>
          {off > 0 && (
            <StatSub>{off} shift{off === 1 ? "" : "s"} off</StatSub>
          )}
        </div>
      </div>
    </div>
  );
}
