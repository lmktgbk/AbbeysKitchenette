import React from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPeso } from "../utils/dashboardUtils";

const WASTE_TYPES = [
  { key: "cancellation", label: "Cancellations", icon: "xCircle", color: "text-red-500" },
  { key: "spoilage", label: "Spoilage", icon: "alertTriangle", color: "text-orange-500" },
  { key: "spillage", label: "Spillage", icon: "droplets", color: "text-blue-500" },
  { key: "expiry", label: "Expiry", icon: "clock", color: "text-yellow-500" },
  { key: "other", label: "Other", icon: "moreHorizontal", color: "text-muted-foreground" },
];

/**
 * WasteSummaryCard — breakdown of waste/loss by type with totals.
 *
 * @param {Object} props
 * @param {Array} props.data - [{ type, count, totalCost }]
 * @param {number} props.totalLosses - total losses from kpis (for the big number)
 * @param {boolean} props.isLoading
 */
function WasteSummaryCard({ data, totalLosses, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalFromData = data?.reduce((sum, d) => sum + (d.totalCost || 0), 0) || 0;
  const totalItems = data?.reduce((sum, d) => sum + (d.count || 0), 0) || 0;

  const typeMap = {};
  data?.forEach((d) => { typeMap[d.type] = d; });

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Waste &amp; Loss Summary</h3>
      </div>
      <div className="p-4">
        {/* Big total */}
        <div className="mb-4 rounded-lg bg-destructive/5 px-4 py-3 text-center">
          <p className="text-xs text-muted-foreground">Total Waste</p>
          <p className="text-2xl font-bold text-destructive">{formatPeso(totalFromData || totalLosses || 0)}</p>
          <p className="text-xs text-muted-foreground">{totalItems} item{totalItems !== 1 ? "s" : ""} affected</p>
        </div>

        {/* Breakdown rows — only show non-zero */}
        <div className="space-y-2">
          {WASTE_TYPES.filter((wt) => {
            const entry = typeMap[wt.key];
            return (entry?.count || 0) > 0;
          }).map((wt) => {
            const entry = typeMap[wt.key];
            const cost = entry?.totalCost || 0;
            const count = entry?.count || 0;
            const pct = totalFromData > 0 ? Math.round((cost / totalFromData) * 100) : 0;

            return (
              <div
                key={wt.key}
                className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <Icon name={wt.icon} size={16} className={wt.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{wt.label}</p>
                  <p className="text-xs text-muted-foreground">{count} item{count !== 1 ? "s" : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{formatPeso(cost)}</p>
                  <p className="text-xs text-muted-foreground">{pct}%</p>
                </div>
              </div>
            );
          })}
          {WASTE_TYPES.every((wt) => (typeMap[wt.key]?.count || 0) === 0) && (
            <div className="py-6 text-center">
              <Icon name="checkCircle" size={28} className="mx-auto mb-2 text-green-500/50" />
              <p className="text-sm font-medium text-foreground/70">No waste recorded</p>
              <p className="text-xs text-muted-foreground">Losses from cancellations, spoilage, spillage, expiry, or other will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(WasteSummaryCard);
