import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

function FulfillmentTimeCard({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-5 space-y-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
    );
  }

  const avg = data?.avgMinutes || 0;
  const median = data?.medianMinutes || 0;
  const count = data?.count || 0;

  const avgColor = avg <= 10 ? "text-emerald-600 dark:text-emerald-400" : avg <= 20 ? "text-amber-600 dark:text-amber-400" : "text-red-500 dark:text-red-400";

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Fulfillment Time</h3>
      </div>
      <div className="p-5">
        <div className="flex items-end gap-2 mb-3">
          <span className={`text-3xl font-bold ${avgColor}`}>{avg}</span>
          <span className="text-sm text-muted-foreground mb-1">min avg</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Median</span>
            <span className="font-semibold text-foreground">{median} min</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Orders measured</span>
            <span className="font-semibold text-foreground">{count}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Icon name="clock" size={12} />
          <span>Time from order placed to completed</span>
        </div>
      </div>
    </div>
  );
}

export default React.memo(FulfillmentTimeCard);
