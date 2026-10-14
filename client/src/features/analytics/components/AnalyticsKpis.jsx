import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";

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

export default function AnalyticsKpis({ kpis, isLoading }) {
  const [showRetained, setShowRetained] = React.useState(false);
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

  const hasLosses = Number(kpis?.totalLosses || 0) > 0;

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
      sub: "Cancelled orders / removed items",
      delta: kpis?.deltas?.retainedPayments,
      tone: "neutral",
      iconBg: "bg-blue-500/10",
      iconColor: "text-blue-600 dark:text-blue-400",
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
    <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.label} className={cn("min-w-0", card.label === "Net Profit" && "col-span-full xl:col-span-1 xl:col-start-5 xl:row-start-1 xl:row-span-2")}>
        <StatCard
          className={cn("h-full min-w-0", card.label === "Net Profit" && "flex flex-col justify-center bg-primary/5 [&>span]:text-3xl")}
          icon={card.icon}
          iconBg={card.iconBg}
          iconColor={card.iconColor}
          label={card.label}
          value={card.value}
          sub={card.sub}
          extra={
            card.label === "Retained Payments" ? (
              <button type="button" onClick={() => setShowRetained(true)} className="shrink-0 text-xs text-primary underline" aria-label="View retained payment details">Details</button>
            ) : card.delta != null ? (
              <>
                <span className="type-small text-muted-foreground">·</span>
                <TrendArrow value={card.delta} tone={card.tone} />
              </>
            ) : null
          }
        />
        </div>
      ))}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Net profit includes retained payments and deducts ingredient losses. Operating expenses are not included.</p>
    <Dialog open={showRetained} onOpenChange={setShowRetained}>
      <DialogContent className="max-w-2xl">
        <DialogClose onClick={() => setShowRetained(false)} />
        <DialogHeader><DialogTitle>Retained Payments</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Payments kept after refunds, excluding completed sales. Uses the selected order-date period.</p>
        <div className="max-h-[60vh] overflow-auto space-y-3">
          {(kpis?.retainedPaymentDetails ?? []).map(row => (
            <div key={row.order_id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span>Order #{row.order_number} · {String(row.date).slice(0, 10)}</span><strong>{formatPeso(row.amount)}</strong></div>
              <p className="text-muted-foreground capitalize">{row.payment_method ?? "cash"}</p>
              <p className="break-words">{row.reason || "Historical reason not recorded"}</p>
            </div>
          ))}
          {!kpis?.retainedPaymentDetails?.length && <p className="text-sm">No retained payments in this period.</p>}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

export const MemoAnalyticsKpis = React.memo(AnalyticsKpis);
