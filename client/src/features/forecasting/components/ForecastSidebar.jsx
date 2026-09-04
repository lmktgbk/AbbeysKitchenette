import { useMemo } from "react";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";

/**
 * ForecastSidebar — skipped variants + top 5 sellers.
 */
export default function ForecastSidebar({ forecasted, skipped, viewPeriod }) {
  const topSellers = useMemo(() => {
    if (!forecasted?.length) return [];
    return [...forecasted]
      .sort((a, b) => {
        const aUnits = a.daily_data.slice(0, viewPeriod).reduce((s, d) => s + d.units, 0);
        const bUnits = b.daily_data.slice(0, viewPeriod).reduce((s, d) => s + d.units, 0);
        return bUnits - aUnits;
      })
      .slice(0, 5)
      .map((v) => ({
        variant_id: v.variant_id,
        product_name: v.product_name,
        size_name: v.size_name,
        units: v.daily_data.slice(0, viewPeriod).reduce((s, d) => s + d.units, 0),
        revenue: v.daily_data.slice(0, viewPeriod).reduce((s, d) => s + d.revenue, 0),
        trend: v.trend,
      }));
  }, [forecasted, viewPeriod]);

  const hasSkipped = skipped?.length > 0;
  const hasTopSellers = topSellers.length > 0;

  if (!hasSkipped && !hasTopSellers) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Skipped Variants */}
      {hasSkipped && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="alertCircle" size={16} className="text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Skipped Variants</h3>
            </div>
            <Badge variant="primary">{skipped.length}</Badge>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <div className="divide-y divide-border">
              {skipped.map((v) => (
                <div key={v.variant_id} className="px-4 py-3">
                  <p className="text-sm font-medium text-foreground">
                    {v.product_name}
                    {v.size_name && (
                      <span className="ml-1 text-muted-foreground font-normal">
                        ({v.size_name})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v.reason || "Insufficient sales history"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top 5 Sellers */}
      {hasTopSellers && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon name="trendingUp" size={16} className="text-green-600 dark:text-green-400" />
              <h3 className="text-sm font-semibold text-foreground">Top Sellers</h3>
            </div>
            <span className="text-xs text-muted-foreground">{viewPeriod}d forecast</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <div className="divide-y divide-border">
              {topSellers.map((v, idx) => (
                <div key={v.variant_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {v.product_name}
                      {v.size_name && (
                        <span className="ml-1 text-muted-foreground font-normal">
                          ({v.size_name})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.units.toLocaleString()} units · ₱{v.revenue.toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant={
                      v.trend === "increasing" ? "success" :
                        v.trend === "decreasing" ? "destructive" : "outline"
                    }
                  >
                    {v.trend}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
