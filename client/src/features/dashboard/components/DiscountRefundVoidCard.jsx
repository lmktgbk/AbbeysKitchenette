import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPeso } from "../utils/dashboardUtils";

function DiscountRefundVoidCard({ discountSummary, refundSummary, cancellationReasons, cancellationRate, isLoading, onDeepDive }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const totalDiscounts = discountSummary?.totalDiscounts || 0;
  const discountCount = discountSummary?.discountCount || 0;
  const seniorTotal = discountSummary?.senior || 0;
  const pwdTotal = discountSummary?.pwd || 0;
  const promoTotal = discountSummary?.promotional || 0;
  const employeeTotal = discountSummary?.employee || 0;
  const totalRefunds = refundSummary?.totalRefunds || 0;
  const refundCount = refundSummary?.refundCount || 0;
  const voidCount = cancellationReasons?.reduce((s, r) => s + r.count, 0) || 0;

  return (
    <div
      className="rounded-lg border border-border bg-card cursor-pointer hover:border-muted-foreground/30 transition-colors"
      onClick={onDeepDive}
    >
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Discounts / Refunds / Voids</h3>
        <Icon name="chevronRight" size={14} className="text-muted-foreground" />
      </div>
      <div className="p-4 space-y-3">
        {/* Discounts */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-pink-500/10">
              <Icon name="tag" size={12} className="text-pink-600 dark:text-pink-400" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">Discounts</p>
              <p className="text-[10px] text-muted-foreground">{discountCount} applied</p>
            </div>
          </div>
          <span className="text-sm font-bold text-foreground">{formatPeso(totalDiscounts)}</span>
        </div>
        {totalDiscounts > 0 && (
          <div className="ml-8 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            {seniorTotal > 0 && <span>Senior: {formatPeso(seniorTotal)}</span>}
            {pwdTotal > 0 && <span>PWD: {formatPeso(pwdTotal)}</span>}
            {promoTotal > 0 && <span>Promo: {formatPeso(promoTotal)}</span>}
            {employeeTotal > 0 && <span>Employee: {formatPeso(employeeTotal)}</span>}
          </div>
        )}

        <div className="h-px bg-border" />

        {/* Refunds */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/10">
              <Icon name="rotateCcw" size={12} className="text-red-600 dark:text-red-400" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">Refunds</p>
              <p className="text-[10px] text-muted-foreground">{refundCount} processed</p>
            </div>
          </div>
          <span className="text-sm font-bold text-foreground">{formatPeso(totalRefunds)}</span>
        </div>

        <div className="h-px bg-border" />

        {/* Voids */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10">
              <Icon name="xCircle" size={12} className="text-amber-600 dark:text-amber-400" />
            </span>
            <div>
              <p className="text-xs font-medium text-foreground">Voids (Cancellations)</p>
              <p className="text-[10px] text-muted-foreground">{cancellationRate || 0}% rate</p>
            </div>
          </div>
          <span className="text-sm font-bold text-foreground">{voidCount}</span>
        </div>
      </div>
    </div>
  );
}

export default React.memo(DiscountRefundVoidCard);
