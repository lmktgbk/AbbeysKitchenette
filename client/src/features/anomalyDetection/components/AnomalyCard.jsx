import { useState } from "react";
import Icon from "@/components/ui/icon";

const SEVERITY_CONFIG = {
  critical: {
    color: "border-l-red-500",
    badge: "bg-red-500/10 text-red-600 dark:text-red-400",
    iconBg: "bg-red-500/10",
    iconColor: "text-red-600 dark:text-red-400",
    icon: "alertTriangle",
  },
  high: {
    color: "border-l-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    icon: "alertCircle",
  },
  medium: {
    color: "border-l-orange-400",
    badge: "bg-orange-400/10 text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-400/10",
    iconColor: "text-orange-600 dark:text-orange-400",
    icon: "info",
  },
  low: {
    color: "border-l-blue-400",
    badge: "bg-blue-400/10 text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-400/10",
    iconColor: "text-blue-600 dark:text-blue-400",
    icon: "info",
  },
};

const CATEGORY_ICONS = {
  revenue: "dollarSign",
  loss: "warehouse",
  cancellation: "alertCircle",
  fulfillment: "clock",
  refund: "receipt",
  discount: "percent",
  cash: "wallet",
  restock: "package",
  stockout: "alertTriangle",
  supplier: "truck",
  payment: "creditCard",
  sales_hours: "clock",
};

const CATEGORY_LABELS = {
  revenue: "Sales",
  loss: "Waste",
  cancellation: "Cancelled",
  fulfillment: "Service",
  refund: "Refunds",
  discount: "Discounts",
  cash: "Cash",
  restock: "Restock",
  stockout: "Stock",
  supplier: "Supplier",
  payment: "Payments",
  sales_hours: "Hours",
};

function formatTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function AnomalyCard({ anomaly, onAcknowledge }) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[anomaly.severity] || SEVERITY_CONFIG.low;

  return (
    <div className={`rounded-xl border border-border bg-card border-l-4 ${config.color} transition-colors hover:shadow-sm`}>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${config.iconBg}`}>
              <Icon name={CATEGORY_ICONS[anomaly.category] || "info"} size={17} className={config.iconColor} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">{anomaly.title}</h3>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${config.badge}`}>
                  {anomaly.severity}
                </span>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {CATEGORY_LABELS[anomaly.category]}
                </span>
              </div>
              <p className="text-sm text-foreground/80 mt-1">{anomaly.description}</p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {formatTimeAgo(anomaly.detectedAt)}
              </p>
            </div>
          </div>
          {!anomaly.isAcknowledged && (
            <button
              onClick={() => onAcknowledge(anomaly.id)}
              className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground whitespace-nowrap"
            >
              Mark reviewed
            </button>
          )}
        </div>

        {/* What to do — collapsed */}
        {anomaly.geminiInsight && (
          <div className="mt-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Icon name="sparkles" size={12} />
              {expanded ? "Hide" : "Show"} What to do
              <Icon name={expanded ? "chevronDown" : "chevronRight"} size={12} />
            </button>
            {expanded && (
              <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                {anomaly.geminiInsight}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
