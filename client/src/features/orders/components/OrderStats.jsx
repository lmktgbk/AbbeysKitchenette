import { useOrderStats } from "../query";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";

/**
 * OrderStats — KPI cards showing order status counts.
 * 5 cards: Pending, Accepted, Preparing, Completed, Cancelled.
 * Clickable to filter order table by status. Follows the same scope as the
 * table: "active" = live queue (dates ignored), "all" = date-range counts.
 * Unfiltered, undated "all" = all-time counts.
 *
 * @param {string} props.activeStatus - currently selected status filter
 * @param {(status: string) => void} props.onStatusClick - status toggle handler
 * @param {string|null} [props.dateFrom] - "YYYY-MM-DD" or null
 * @param {string|null} [props.dateTo] - "YYYY-MM-DD" or null
 * @param {string} [props.scope] - "active" | "all"
 */
export default function OrderStats({ activeStatus, onStatusClick, dateFrom, dateTo, scope = "all" }) {
  const { data: statsData, isLoading } = useOrderStats({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    scope,
  });

  const stats = statsData?.data?.stats ?? {
    pending: 0,
    accepted: 0,
    preparing: 0,
    completed: 0,
    cancelled: 0,
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-8" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    { key: "pending", label: "Pending", icon: "clock", color: "text-yellow-600 dark:text-yellow-400", ring: "ring-yellow-500/20" },
    { key: "accepted", label: "Accepted", icon: "check", color: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/20" },
    { key: "preparing", label: "Preparing", icon: "coffee", color: "text-orange-600 dark:text-orange-400", ring: "ring-orange-500/20" },
    { key: "completed", label: "Completed", icon: "checkCircle", color: "text-green-600 dark:text-green-400", ring: "ring-green-500/20" },
    { key: "cancelled", label: "Cancelled", icon: "x", color: "text-red-600 dark:text-red-400", ring: "ring-red-500/20" },
  ];

  return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <button
          key={card.key}
          onClick={() => onStatusClick?.(activeStatus === card.key ? "all" : card.key)}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
            activeStatus === card.key
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:bg-muted/50"
          }`}
        >
          <div className={`relative h-10 w-10 shrink-0 rounded-full ring-4 ${card.ring}`}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon name={card.icon} size={18} className={card.color} />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </p>
            <p className="text-lg font-bold text-foreground">
              {stats[card.key] ?? 0}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
