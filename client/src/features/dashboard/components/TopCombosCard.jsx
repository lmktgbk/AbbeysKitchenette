import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

function TopCombosCard({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-[140px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="sparkles" size={28} className="text-muted-foreground/30" />
          <p className="font-medium">No combo data</p>
          <p className="text-xs">Run Market Basket Analysis to discover product pairs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Top Combo Pairs</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
          {data.length} found
        </span>
      </div>
      <div className="p-2">
        {data.map((combo, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground truncate">
                {combo.productA} + {combo.productB}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Lift: {Number(combo.lift).toFixed(1)}x · Confidence: {Math.round(combo.confidence * 100)}%
              </div>
            </div>
            {combo.isCombo && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                Combo
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default React.memo(TopCombosCard);
