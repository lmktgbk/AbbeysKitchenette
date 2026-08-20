import Icon from "@/components/ui/icon";

/**
 * ReorderSuggestions
 *
 * Placeholder sidebar panel for intelligent reorder suggestions.
 * Will be powered by the demand forecasting module when built.
 *
 * Shows a "Coming Soon" card listing what the feature will do.
 */
export default function ReorderSuggestions() {
  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon name="package" size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          Reorder Suggestions
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
            <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
            What to reorder
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
            How much to order
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
            When to order
          </li>
        </ul>
      </div>
    </div>
  );
}
