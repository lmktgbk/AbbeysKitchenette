import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";
import KpiDetailsModal from "./KpiDetailsModal";

/**
 * TrendArrow — period-over-period delta badge.
 * tone "good" (default): up = green, down = red — for sales/profit cards
 * where direction equals performance. tone "neutral": always gray — for
 * cost cards (COGS), where movement tracks volume and the margin figure
 * beside it is the real verdict, not the direction.
 */
function TrendArrow({ value, tone = "good" }) {
  if (value == null) return null;
  const isUp = value > 0;
  const isFlat = value === 0;
  const neutral = tone === "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold",
        (isFlat || neutral) && "text-muted-foreground",
        !neutral && isUp && "text-emerald-600 dark:text-emerald-400",
        !neutral && !isFlat && !isUp && "text-red-500 dark:text-red-400",
      )}
    >
      {!isFlat && <Icon name={isUp ? "trendingUp" : "trendingDown"} size={12} />}
      {isFlat ? "0" : `${Math.abs(value)}%`}
    </span>
  );
}

export default function AnalyticsKpis({ kpis, isLoading, dateFrom, dateTo }) {
  const [selectedCard, setSelectedCard] = React.useState(null);
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className={cn("rounded-lg border border-border bg-card px-4 py-3", i === 8 && "col-span-full xl:col-span-1 xl:col-start-5 xl:row-start-1 xl:row-span-2")}>
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
      label: "Gross Sales",
      value: formatPeso(kpis?.grossSales),
      sub: "Before discounts",
      delta: kpis?.deltas?.grossSales,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: "wallet",
      label: "Discounts",
      value: formatPeso(kpis?.discounts),
      sub: "Total given",
      delta: null,
      iconBg: "bg-orange-500/10",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      icon: "trendingUp",
      label: "Net Sales",
      value: formatPeso(kpis?.netSales),
      sub: "After discounts",
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
      // Neutral: cost movement tracks sales volume — margin is the verdict.
      tone: "neutral",
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
      label: "Retained Payments",
      value: formatPeso(kpis?.retainedPayments),
      sub: "Payments kept after refunds",
      delta: kpis?.deltas?.retainedPayments,
      tone: "neutral",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: "wallet",
      label: "Net Profit",
      value: formatPeso(kpis?.netProfit),
      sub: `${kpis?.netMargin ?? 0}% margin`,
      delta: kpis?.deltas?.netProfit,
      iconBg: "bg-amber-500/10",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map(card => {
          const isProfit = card.label === "Net Profit";
          return (
            <button key={card.label} type="button" onClick={() => setSelectedCard(card.label)}
              aria-label={`View ${card.label} breakdown`} aria-haspopup="dialog"
              className={cn("min-w-0 rounded-lg text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isProfit && "col-span-full xl:col-span-1 xl:col-start-5 xl:row-start-1 xl:row-span-2 border border-border bg-primary/5 p-4 flex flex-col justify-between")}>
              <StatCard className={cn("h-full min-w-0", isProfit && "h-auto border-0 bg-transparent p-0 [&>span]:text-3xl")}
                icon={card.icon} iconBg={card.iconBg} iconColor={card.iconColor}
                label={card.label} value={card.value} sub={card.sub}
                extra={card.delta != null ? <TrendArrow value={card.delta} tone={card.tone} /> : null} />
              {isProfit && <dl className="mt-3 border-t border-border pt-3 space-y-2 text-xs">
                {[["Gross profit", kpis?.grossProfit], ["Retained payments", kpis?.retainedPayments], ["Ingredient losses", -(kpis?.totalLosses ?? 0)]].map(([label, amount]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-x-2 gap-y-1"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{formatPeso(amount)}</dd></div>
                ))}
              </dl>}
            </button>
          );
        })}
      </div>
      {selectedCard && <KpiDetailsModal key={`${selectedCard}:${dateFrom}:${dateTo}`} label={selectedCard} kpis={kpis}
        dateFrom={dateFrom} dateTo={dateTo} onClose={() => setSelectedCard(null)} />}
    </>
  );
}

export const MemoAnalyticsKpis = React.memo(AnalyticsKpis);
