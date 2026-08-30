import { cn } from "@/lib/utils";

const TABS = [
  { key: "sales", label: "Sales Forecast" },
  { key: "restock", label: "Restock Alerts" },
  { key: "popularity", label: "Product Trends" },
];

/**
 * ForecastTabs — pill-style tab switcher for forecasting sections.
 */
export default function ForecastTabs({ active, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-border overflow-hidden">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors",
            active === tab.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
