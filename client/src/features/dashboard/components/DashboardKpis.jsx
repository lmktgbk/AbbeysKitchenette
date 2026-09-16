import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPeso, formatCompact } from "../utils/dashboardUtils";

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
      value: formatPeso(kpis?.revenuePeriod),
      sub: `${formatPeso(kpis?.revenueToday)} today`,
      delta: kpis?.deltas?.revenue,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: "receipt",
      label: "Orders",
      value: formatCompact(kpis?.ordersPeriod),
      sub: `${Number(kpis?.ordersToday || 0)} today`,
      delta: kpis?.deltas?.orders,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: "trendingUp",
      label: "Avg Order Value",
      value: formatPeso(kpis?.aovPeriod),
      sub: `${formatPeso(kpis?.aovToday)} today`,
      delta: kpis?.deltas?.aov,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      icon: "package",
      label: "COGS",
      value: formatPeso(kpis?.cogs),
      sub: "Cost of goods sold",
      delta: null,
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      icon: "wallet",
      label: "Profit",
      value: formatPeso(kpis?.profit),
      sub: `${kpis?.margin || 0}% margin`,
      delta: null,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      icon: "alertCircle",
      label: "Total Loss",
      value: formatPeso(kpis?.totalLosses),
      sub: `${kpis?.lossRate || 0}% of COGS`,
      delta: null,
      iconBg: "bg-red-500/10",
      iconColor: "text-red-600 dark:text-red-400",
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
          <div className="text-lg font-bold text-foreground mb-0.5 truncate whitespace-nowrap">{card.value}</div>
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
