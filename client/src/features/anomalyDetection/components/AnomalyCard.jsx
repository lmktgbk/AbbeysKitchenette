import { useState } from "react";
import Icon from "@/components/ui/icon";

const SEVERITY_CONFIG = {
  critical: { color: "border-l-red-500", badge: "destructive", icon: "alertTriangle" },
  high: { color: "border-l-amber-500", badge: "warning", icon: "alertCircle" },
  medium: { color: "border-l-orange-400", badge: "orange", icon: "info" },
  low: { color: "border-l-blue-400", badge: "info", icon: "info" },
};

const CATEGORY_ICONS = {
  revenue: "dollarSign",
  loss: "warehouse",
  cancellation: "alertCircle",
  fulfillment: "clock",
};

const CATEGORY_LABELS = {
  revenue: "Revenue",
  loss: "Loss",
  cancellation: "Cancellation",
  fulfillment: "Fulfillment",
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
    <div className={`rounded-xl border border-border bg-card border-l-4 ${config.color} transition-colors`}>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 shrink-0`}>
              <Icon name={CATEGORY_ICONS[anomaly.category] || "info"} size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">{anomaly.title}</h3>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-${config.badge === "destructive" ? "destructive" : config.badge === "warning" ? "amber-500" : config.badge === "orange" ? "orange-400" : "blue-400"}/10 text-${config.badge === "destructive" ? "destructive" : config.badge === "warning" ? "amber-600" : config.badge === "orange" ? "orange-600" : "blue-600"}`}>
                  {anomaly.severity}
                </span>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {CATEGORY_LABELS[anomaly.category]}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{anomaly.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
              {formatTimeAgo(anomaly.detectedAt)}
            </span>
            {!anomaly.isAcknowledged && (
              <button
                onClick={() => onAcknowledge(anomaly.id)}
                className="text-xs text-primary hover:underline whitespace-nowrap"
              >
                Mark Reviewed
              </button>
            )}
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Confidence:</span>
          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(anomaly.confidence * 100).toFixed(0)}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            {(anomaly.confidence * 100).toFixed(0)}%
          </span>
        </div>

        {/* Gemini Insight */}
        {anomaly.geminiInsight && (
          <div className="mt-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Icon name="sparkles" size={12} />
              {expanded ? "Hide" : "Show"} Prescriptive Analytics
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
