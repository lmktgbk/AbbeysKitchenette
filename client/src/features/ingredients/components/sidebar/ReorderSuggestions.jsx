import { useState } from "react";
import { toast } from "sonner";
import { useIngredientMutations } from "../../query";
import { useReorderSuggestions } from "../../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ReorderSuggestions
 *
 * Sidebar panel showing AI-generated reorder suggestions.
 * Each suggestion has urgency badge, reasoning, and accept/reject actions.
 *
 * Props:
 * - onAccept: (suggestion) => void — called when user accepts (opens RestockModal)
 */
export default function ReorderSuggestions({ onAccept }) {
  const { data: suggestionsData, isLoading } = useReorderSuggestions();
  const mutations = useIngredientMutations();
  const [expandedId, setExpandedId] = useState(null);

  const suggestions = suggestionsData?.data?.suggestions ?? [];

  function handleGenerate() {
    mutations.generateReorder.mutate(undefined, {
      onSuccess: (res) => {
        const count = res?.data?.suggestions?.length ?? 0;
        toast.success(`Generated ${count} reorder suggestion${count !== 1 ? "s" : ""}`);
      },
      onError: (err) => {
        toast.error(err.response?.data?.message || "Failed to generate reorder suggestions");
      },
    });
  }

  function handleAccept(suggestion) {
    if (onAccept) {
      onAccept(suggestion);
    }
  }

  async function handleReject(id) {
    const ok = await confirm({
      title: "Dismiss Suggestion?",
      message: "This reorder suggestion will be dismissed.",
      confirmLabel: "Dismiss",
      variant: "warning",
    });
    if (ok) {
      mutations.rejectReorder.mutate(id, {
        onError: (err) => {
          toast.error(err.response?.data?.message || "Failed to dismiss suggestion");
        },
      });
    }
  }

  const urgencyConfig = {
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
          <Icon name="package" size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Reorder Suggestions
          </h3>
          {suggestions.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {suggestions.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleGenerate}
          disabled={mutations.generateReorder.isPending}
        >
          {mutations.generateReorder.isPending ? (
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
        ) : suggestions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Icon
              name="checkCircle"
              size={24}
              className="mx-auto mb-2 text-green-500"
            />
            <p className="text-sm text-muted-foreground">
              No reorder needed right now
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click{" "}
              <Icon name="sparkles" size={10} className="inline" /> to generate
              suggestions
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {suggestions.map((s) => {
              const urgency = urgencyConfig[s.urgency] || urgencyConfig.low;
              const isExpanded = expandedId === s.id;

              return (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {s.ingredient_name}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${urgency.className}`}
                        >
                          {urgency.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Order {s.suggested_quantity} {s.unit}
                        {s.estimated_stockout && (
                          <span>
                            {" "}
                            · Stockout:{" "}
                            {new Date(
                              s.estimated_stockout,
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {Math.round(s.confidence * 100)}% confidence
                    </span>
                  </div>

                  {/* Expandable reasoning */}
                  <button
                    className="mt-1 text-xs text-primary hover:underline"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : s.id)
                    }
                  >
                    {isExpanded ? "Hide details" : "Why?"}
                  </button>
                  {isExpanded && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {s.reasoning}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-7 text-xs"
                      onClick={() => handleAccept(s)}
                      disabled={mutations.acceptReorder.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleReject(s.id)}
                      disabled={mutations.rejectReorder.isPending}
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
