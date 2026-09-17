import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function InventoryVarianceCard({ data, isLoading, onDeepDive }) {
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

  const countDate = data?.countDate;
  const totalSystem = data?.totalSystem || 0;
  const totalActual = data?.totalActual || 0;
  const totalVariance = data?.totalVariance || 0;
  const variancePercent = data?.variancePercent || 0;
  const topVariances = data?.topVariances || [];

  const hasVariance = Math.abs(totalVariance) > 0;
  const isNegative = totalVariance < 0;

  return (
    <div
      className="rounded-lg border border-border bg-card cursor-pointer hover:border-muted-foreground/30 transition-colors"
      onClick={onDeepDive}
    >
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Inventory Variance</h3>
        <Icon name="chevronRight" size={14} className="text-muted-foreground" />
      </div>
      <div className="p-4">
        {!countDate ? (
          <div className="flex flex-col items-center justify-center py-6 text-sm text-muted-foreground">
            <Icon name="clipboardList" size={28} className="text-muted-foreground/30 mb-2" />
            <p className="font-medium">No inventory count yet</p>
            <p className="text-xs">Complete a count to see variance data</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-muted-foreground">
                Last count: {new Date(countDate).toLocaleDateString()}
              </span>
              <span
                className={cn(
                  "text-xs font-bold",
                  isNegative ? "text-red-500" : hasVariance ? "text-emerald-500" : "text-muted-foreground"
                )}
              >
                {isNegative ? "" : "+"}{totalVariance.toFixed(1)} ({variancePercent}%)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">System</p>
                <p className="text-sm font-bold text-foreground">{totalSystem.toFixed(1)}</p>
              </div>
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Actual</p>
                <p className="text-sm font-bold text-foreground">{totalActual.toFixed(1)}</p>
              </div>
            </div>

            {topVariances.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">Top Variances</p>
                {topVariances.map((v, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[140px]">{v.name}</span>
                    <span
                      className={cn(
                        "font-medium",
                        v.variance < 0 ? "text-red-500" : "text-emerald-500"
                      )}
                    >
                      {v.variance > 0 ? "+" : ""}{v.variance.toFixed(1)} {v.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default React.memo(InventoryVarianceCard);
