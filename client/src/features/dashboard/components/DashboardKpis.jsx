import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPeso, formatCompact } from "../utils/dashboardUtils";

function DashboardKpis({ kpis, isLoading }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
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
      icon: "trendingUp",
      label: "Gross Sales",
      value: formatPeso(kpis?.grossRevenue),
      sub: "Before deductions",
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: "tag",
      label: "Discounts",
      value: formatPeso(kpis?.totalDiscounts),
      sub: `${kpis?.discountCount || 0} applied`,
      iconBg: "bg-pink-500/10",
      iconColor: "text-pink-600 dark:text-pink-400",
    },
    {
      icon: "dollarSign",
      label: "Net Sales",
      value: formatPeso(kpis?.netRevenue),
      sub: "After discounts",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: "package",
      label: "COGS",
      value: formatPeso(kpis?.cogs),
      sub: "Cost of ingredients",
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      icon: "wallet",
      label: "Gross Profit",
      value: formatPeso(kpis?.grossProfit),
      sub: "Net Sales − COGS",
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      icon: "percent",
      label: "Gross Margin",
      value: `${kpis?.grossMargin || 0}%`,
      sub: "Profit percentage",
      iconBg: "bg-teal-500/10",
      iconColor: "text-teal-600 dark:text-teal-400",
    },
    {
      icon: "receipt",
      label: "Transactions",
      value: formatCompact(kpis?.transactions),
      sub: "Completed orders",
      iconBg: "bg-violet-500/10",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      icon: "barChart2",
      label: "Avg Transaction",
      value: formatPeso(kpis?.avgTransactionValue),
      sub: "Per order",
      iconBg: "bg-cyan-500/10",
      iconColor: "text-cyan-600 dark:text-cyan-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          <div className="text-[11px] text-muted-foreground truncate">{card.sub}</div>
        </div>
      ))}
    </div>
  );
}

export default React.memo(DashboardKpis);
