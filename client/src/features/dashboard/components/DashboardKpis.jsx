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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card px-5 py-4">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-3 w-16" />
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
      icon: "percent",
      label: "Profit Margin",
      value: `${kpis?.margin || 0}%`,
      sub: `${kpis?.totalProducts || 0} products`,
      delta: null,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card px-5 py-4"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", card.iconBg)}>
              <Icon name={card.icon} size={16} className={card.iconColor} />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground mb-1">{card.value}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{card.sub}</span>
            {card.delta !== null && card.delta !== undefined && (
              <>
                <span className="text-xs text-muted-foreground">·</span>
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
