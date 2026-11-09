import { useIngredientSummary, useStockValue } from "../query";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * KpiCards
 *
 * Summary cards showing ingredient stock health at a glance.
 * 4 cards: Total Items, Total Value, Healthy (ring), Low/Out (ring).
 */
export default function KpiCards({ statusFilter = "all", onStatusFilterChange }) {
  const { data: summaryData, isLoading } = useIngredientSummary();
  const { data: stockValueData, isLoading: stockValueLoading } = useStockValue();

  const summary = summaryData?.data?.summary ?? {
    total: 0,
    healthy: 0,
    low: 0,
    out: 0,
  };

  const totalValue = stockValueData?.data?.totalValue ?? 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

  const total = summary.total || 1;
  const lowAndOut = summary.low + summary.out;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Total Items" value={summary.total} active={statusFilter === "all"} onClick={() => onStatusFilterChange?.("all")} />
      <StatCard
        label="Total Value"
        value={stockValueLoading ? <Skeleton className="h-5 w-16" /> : totalValue}
        prefix="₱"
      />
      <RingCard
        label="Healthy"
        count={summary.healthy}
        total={total}
        color="text-green-600 dark:text-green-400"
        ring="ring-green-500/20"
        active={statusFilter === "healthy"}
        onClick={() => onStatusFilterChange?.("healthy")}
      />
      <RingCard
        label="Low / Out"
        count={lowAndOut}
        total={total}
        color="text-red-600 dark:text-red-400"
        ring="ring-red-500/20"
        active={statusFilter === "attention"}
        onClick={() => onStatusFilterChange?.("attention")}
      />
    </div>
  );
}

function StatCard({ label, value, prefix = "", active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50"}`}>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-bold text-foreground">
          {prefix}{typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </button>
  );
}

function RingCard({ label, count, total, color, ring, active, onClick }) {
  const pct = Math.round((count / total) * 100);

  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50"}`}>
      <div className={`relative h-10 w-10 shrink-0 rounded-full ring-4 ${ring}`}>
        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${pct} 100`}
            className={color}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${color}`}>
          {count}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-bold text-foreground">{count}</p>
      </div>
    </button>
  );
}
