import { useProductSummary } from "../query";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * KpiCards
 *
 * Summary cards showing product status at a glance.
 * 4 cards: Total Products, Available, Unavailable, Categories Used.
 */
export default function KpiCards() {
  const { data: summaryData, isLoading } = useProductSummary();

  const summary = summaryData?.data?.summary ?? {
    total: 0,
    available: 0,
    unavailable: 0,
    categories_used: 0,
  };

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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard label="Total Products" value={summary.total} />
      <RingCard
        label="Available"
        count={summary.available}
        total={total}
        color="text-green-600 dark:text-green-400"
        ring="ring-green-500/20"
      />
      <RingCard
        label="Unavailable"
        count={summary.unavailable}
        total={total}
        color="text-red-600 dark:text-red-400"
        ring="ring-red-500/20"
      />
      <StatCard label="Categories Used" value={summary.categories_used} />
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-bold text-foreground">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
      </div>
    </div>
  );
}

function RingCard({ label, count, total, color, ring }) {
  const pct = Math.round((count / total) * 100);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
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
    </div>
  );
}
