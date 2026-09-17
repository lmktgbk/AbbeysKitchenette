import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPeso } from "../utils/dashboardUtils";
import { cn } from "@/lib/utils";

const PAYMENT_COLORS = {
  cash: "#22c55e",
  gcash: "#3b82f6",
  maya: "#8b5cf6",
  card: "#f59e0b",
};

const PAYMENT_LABELS = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
};

function CashReconciliationCard({ data, isLoading, onDeepDive }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const hasShift = data?.shiftId != null;

  return (
    <div
      className="rounded-lg border border-border bg-card cursor-pointer hover:border-muted-foreground/30 transition-colors"
      onClick={onDeepDive}
    >
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Cash Reconciliation</h3>
        <div className="flex items-center gap-2">
          {hasShift && (
            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              Active
            </span>
          )}
          <Icon name="chevronRight" size={14} className="text-muted-foreground" />
        </div>
      </div>
      <div className="p-4">
        {!hasShift ? (
          <div className="flex flex-col items-center justify-center py-6 text-sm text-muted-foreground">
            <Icon name="clock" size={28} className="text-muted-foreground/30 mb-2" />
            <p className="font-medium">No active shift</p>
            <p className="text-xs">Start a shift to see reconciliation</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Opening Cash */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Opening Cash</span>
              <span className="text-sm font-semibold text-foreground">{formatPeso(data.openingCash)}</span>
            </div>

            <div className="h-px bg-border" />

            {/* Cash Sales */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Cash Sales</span>
              <span className="text-sm font-semibold text-foreground">{formatPeso(data.cashSales)}</span>
            </div>

            {/* Cash Refunds */}
            {data.cashRefunds > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Cash Refunds</span>
                <span className="text-sm font-semibold text-red-500">−{formatPeso(data.cashRefunds)}</span>
              </div>
            )}

            <div className="h-px bg-border" />

            {/* Expected Cash */}
            <div className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2">
              <span className="text-xs font-medium text-foreground">Expected Cash</span>
              <span className="text-sm font-bold text-foreground">{formatPeso(data.expectedCash)}</span>
            </div>

            {/* Payment Breakdown */}
            {data.paymentBreakdown?.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">Payment Breakdown</p>
                {data.paymentBreakdown.map((p) => (
                  <div key={p.method} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: PAYMENT_COLORS[p.method] || "#94a3b8" }}
                      />
                      <span className="text-muted-foreground">
                        {PAYMENT_LABELS[p.method] || p.method}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{p.transactions} txns</span>
                      <span className="font-medium text-foreground">{formatPeso(p.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(CashReconciliationCard);
