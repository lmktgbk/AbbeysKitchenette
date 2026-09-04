import { useState } from "react";
import { toast } from "sonner";
import { useIngredientMutations } from "../../query";
import { useWasteReductions } from "../../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * WasteInsights
 *
 * Sidebar panel showing AI-generated waste reduction insights.
 * Each insight has waste risk badge, potential savings, reasoning, and accept/reject actions.
 */
export default function WasteInsights() {
  const { data: insightsData, isLoading } = useWasteReductions();
  const mutations = useIngredientMutations();
  const [expandedId, setExpandedId] = useState(null);

  const insights = insightsData?.data?.insights ?? [];

  function handleGenerate() {
    mutations.generateWaste.mutate(undefined, {
      onSuccess: (res) => {
        const count = res?.data?.insights?.length ?? 0;
        toast.success(`Generated ${count} waste insight${count !== 1 ? "s" : ""}`);
      },
      onError: (err) => {
        toast.error(err.response?.data?.message || "Failed to generate waste insights");
      },
    });
  }

  function handleAccept(id) {
    mutations.acceptWaste.mutate(id, {
      onError: (err) => {
        toast.error(err.response?.data?.message || "Failed to accept insight");
      },
    });
  }

  async function handleReject(id) {
    const ok = await confirm({
      title: "Dismiss Insight?",
      message: "This waste reduction insight will be dismissed.",
      confirmLabel: "Dismiss",
      variant: "warning",
    });
    if (ok) {
      mutations.rejectWaste.mutate(id, {
        onError: (err) => {
          toast.error(err.response?.data?.message || "Failed to dismiss insight");
        },
      });
    }
  }

  const riskConfig = {
    high: {
      label: "High",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    medium: {
      label: "Medium",
      className:
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    low: {
      label: "Low",
      className:
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="trendingDown" size={16} className="text-destructive" />
          <h3 className="text-sm font-semibold text-foreground">
            Waste Insights
          </h3>
          {insights.length > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {insights.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleGenerate}
          disabled={mutations.generateWaste.isPending}
        >
          {mutations.generateWaste.isPending ? (
            <Icon name="loader" size={14} className="animate-spin" />
          ) : (
            <Icon name="sparkles" size={14} />
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Icon
              name="checkCircle"
              size={24}
              className="mx-auto mb-2 text-green-500"
            />
            <p className="text-sm text-muted-foreground">
              No waste risks detected
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click{" "}
              <Icon name="sparkles" size={10} className="inline" /> to analyze
              waste patterns
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {insights.map((i) => {
              const risk = riskConfig[i.waste_risk] || riskConfig.low;
              const isExpanded = expandedId === i.id;

              return (
                <div key={i.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {i.ingredient_name}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${risk.className}`}
                        >
                          {risk.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Overstocked by {i.overstock_amount} {i.unit}
                        {i.potential_savings && (
                          <span>
                            {" "}
                            · Save ₱{i.potential_savings.toLocaleString()}/mo
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {Math.round(i.confidence * 100)}% confidence
                    </span>
                  </div>

                  {/* Expandable reasoning */}
                  <button
                    className="mt-1 text-xs text-primary hover:underline"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : i.id)
                    }
                  >
                    {isExpanded ? "Hide details" : "Why?"}
                  </button>
                  {isExpanded && (
                    <div className="mt-1 space-y-1">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {i.reasoning}
                      </p>
                      <p className="text-xs font-medium text-foreground">
                        Suggestion: {i.suggestion}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-7 text-xs"
                      onClick={() => handleAccept(i.id)}
                      disabled={mutations.acceptWaste.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleReject(i.id)}
                      disabled={mutations.rejectWaste.isPending}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
