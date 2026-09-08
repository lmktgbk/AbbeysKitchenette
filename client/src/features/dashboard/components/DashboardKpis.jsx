import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function TrendArrow({ value }) {
  if (value === null || value === undefined) return null;
  const isUp = value > 0;
  const isFlat = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold",
        isFlat && "text-muted-foreground",
        isUp && "text-emerald-600 dark:text-emerald-400",
        !isFlat && !isUp && "text-red-500 dark:text-red-400",
      )}
    >
      {!isFlat && (
        <Icon name={isUp ? "trendingUp" : "trendingDown"} size={12} />
      )}
      {isFlat ? "0" : `${Math.abs(value)}%`}
    </span>
  );
}

function DashboardKpis({ kpis, isLoading }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card px-4 py-3">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-7 w-16 mb-1" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      icon: "dollarSign",
      label: "Revenue",
      value: `₱${Number(kpis?.revenuePeriod || 0).toLocaleString()}`,
      sub: `₱${Number(kpis?.revenueToday || 0).toLocaleString()} today`,
      delta: kpis?.deltas?.revenue,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: "receipt",
      label: "Orders",
      value: Number(kpis?.ordersPeriod || 0).toLocaleString(),
      sub: `${Number(kpis?.ordersToday || 0)} today`,
      delta: kpis?.deltas?.orders,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: "trendingUp",
      label: "Avg Order Value",
      value: `₱${Number(kpis?.aovPeriod || 0).toLocaleString()}`,
      sub: `₱${Number(kpis?.aovToday || 0)} today`,
      delta: kpis?.deltas?.aov,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      icon: "package",
      label: "COGS",
      value: `₱${Number(kpis?.cogs || 0).toLocaleString()}`,
      sub: "Cost of goods sold",
      delta: null,
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      icon: "wallet",
      label: "Profit",
      value: `₱${Number(kpis?.profit || 0).toLocaleString()}`,
      sub: `${kpis?.margin || 0}% margin`,
      delta: null,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      icon: "alertTriangle",
      label: "Cancel Rate",
      value: `${kpis?.cancellationRate || 0}%`,
      sub: `${kpis?.cancellationsCancelled || 0} of ${kpis?.cancellationsTotal || 0}`,
      delta: null,
      iconBg: kpis?.cancellationRate > 10 ? "bg-red-500/10" : "bg-emerald-500/10",
      iconColor: kpis?.cancellationRate > 10
        ? "text-red-600 dark:text-red-400"
        : "text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">
              {card.label}
            </span>
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", card.iconBg)}>
              <Icon name={card.icon} size={14} className={card.iconColor} />
            </div>
          </div>
          <div className="text-xl font-bold text-foreground mb-0.5">{card.value}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground truncate">{card.sub}</span>
            {card.delta !== null && card.delta !== undefined && (
              <>
                <span className="text-[11px] text-muted-foreground">·</span>
                <TrendArrow value={card.delta} />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default React.memo(DashboardKpis);
