import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";

function TrendArrow({ value }) {
  if (value == null) return null;
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
      {!isFlat && <Icon name={isUp ? "trendingUp" : "trendingDown"} size={12} />}
      {isFlat ? "0" : `${Math.abs(value)}%`}
    </span>
  );
}

function KpiCard({ icon, label, value, sub, delta, iconBg, iconColor }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</span>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
          <Icon name={icon} size={14} className={iconColor} />
        </div>
      </div>
      <div className="text-lg font-bold text-foreground mb-0.5 truncate whitespace-nowrap">{value}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
        {delta != null && (
          <>
            <span className="text-[11px] text-muted-foreground">·</span>
            <TrendArrow value={delta} />
          </>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsKpis({ kpis, isLoading }) {
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

  // Auto-collapse: Discounts card only matters when discounts were actually given.
  // When ₱0, Gross == Net and the extra card is pure noise.
  const hasDiscounts = Number(kpis?.discounts || 0) > 0;
  const hasLosses = Number(kpis?.totalLosses || 0) > 0;

  const cards = [
    {
      icon: "dollarSign",
      label: "Gross Sales",
      value: formatPeso(kpis?.grossSales),
      sub: hasDiscounts ? "Before discounts" : "No discounts given",
      delta: kpis?.deltas?.grossSales,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    ...(hasDiscounts
      ? [
          {
            icon: "wallet",
            label: "Discounts",
            value: formatPeso(kpis?.discounts),
            sub: "Total given",
            delta: null,
            iconBg: "bg-orange-500/10",
            iconColor: "text-orange-600 dark:text-orange-400",
          },
        ]
      : []),
    {
      icon: "trendingUp",
      label: "Net Sales",
      value: formatPeso(kpis?.netSales),
      sub: hasDiscounts ? "After discounts" : "Equals gross (no discounts)",
      delta: kpis?.deltas?.netSales,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: "receipt",
      label: "Transactions",
      value: String(kpis?.transactions ?? 0),
      sub: `${kpis?.totalUnits ?? 0} units`,
      delta: kpis?.deltas?.transactions,
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: "shoppingBag",
      label: "Average Transaction Value",
      value: formatPeso(kpis?.atv),
      sub: `${kpis?.unitsPerTxn ?? 0} units/txn`,
      delta: kpis?.deltas?.atv,
      iconBg: "bg-purple-500/10",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
    {
      icon: "package",
      label: "COGS",
      value: formatPeso(kpis?.cogs),
      sub: "True FIFO cost",
      delta: kpis?.deltas?.cogs,
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      icon: "trendingUp",
      label: "Gross Profit",
      value: formatPeso(kpis?.grossProfit),
      sub: `${kpis?.grossMargin ?? 0}% margin`,
      delta: kpis?.deltas?.grossProfit,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      icon: "wallet",
      label: "Net Profit",
      value: formatPeso(kpis?.netProfit),
      // Losses here are wasted ingredients only (cash refunds live in the shift ledger).
      sub: hasLosses
        ? `${kpis?.netMargin ?? 0}% margin · Loss ${formatPeso(kpis?.totalLosses)}`
        : `${kpis?.netMargin ?? 0}% margin`,
      delta: kpis?.deltas?.netProfit,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}

export const MemoAnalyticsKpis = React.memo(AnalyticsKpis);
