import { useStaffSummary } from "../query";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * StaffKpis
 *
 * Staff-list summary cards. Same chrome as the module KpiCards so the
 * row feels native when the Staff view switches.
 * 4 cards: Total staff, Active, Cashiers, Kitchen.
 */
export default function StaffKpis() {
  const { data, isLoading, error } = useStaffSummary();
  const summary = data?.data?.summary ?? null;

  if (isLoading || error || !summary) {
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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <StatCard label="Total staff" value={summary.total} />
      <StatCard label="Active" value={summary.active} />
      <StatCard label="Cashiers" value={summary.cashiers} />
      <StatCard label="Kitchen" value={summary.kitchen} />
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
