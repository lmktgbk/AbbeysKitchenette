import Icon from "@/components/ui/icon";

/**
 * WasteInsights
 *
 * Placeholder sidebar panel for waste reduction insights.
 * Will be powered by the demand forecasting module when built.
 *
 * Shows a "Coming Soon" card listing what the feature will do.
 */
export default function WasteInsights() {
  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon name="trendingDown" size={16} className="text-destructive" />
        <h3 className="text-sm font-semibold text-foreground">
          Waste Insights
        </h3>
      </div>

      {/* Placeholder content */}
      <div className="px-4 py-5">
        <div className="mb-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Powered by Demand Forecasting
          </p>
        </div>

        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 shrink-0 rounded-full bg-destructive" />
            Over-ordering patterns
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 shrink-0 rounded-full bg-destructive" />
            Waste reduction tips
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 shrink-0 rounded-full bg-destructive" />
            Cost impact analysis
          </li>
        </ul>
      </div>
    </div>
  );
}
