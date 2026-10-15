import { useState } from "react";
import { toast } from "sonner";
import { useIngredientMutations } from "../../query";
import { useReorderSuggestions } from "../../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/date";

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
  const { data: suggestionsData, isLoading, isError } = useReorderSuggestions();
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
    // Opening a delivery draft must not resolve the recommendation.
    onAccept?.(suggestion);
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
      label: "Buy now",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    medium: {
      label: "Buy soon",
      className:
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    low: {
      label: "Review purchase",
      className:
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
  };

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
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
          aria-label={mutations.generateReorder.isPending ? "Generating reorder suggestions" : "Generate reorder suggestions"}
          aria-busy={mutations.generateReorder.isPending}
        >
          {mutations.generateReorder.isPending ? (
            <Icon name="loader" size={14} className="animate-spin" />
          ) : (
            <Icon name="sparkles" size={14} />
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="min-h-0 max-h-[32rem] overflow-y-auto lg:max-h-none lg:flex-1">
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
        ) : isError ? (
          <p className="px-4 py-6 text-sm text-destructive">Could not load suggestions. Refresh to retry.</p>
        ) : suggestions.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Icon
              name="checkCircle"
              size={24}
              className="mx-auto mb-2 text-green-500"
            />
            <p className="text-sm text-muted-foreground">
              No pending reorder suggestions
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
              const facts = s.metadata;
              const isCurrentPolicy = facts?.policy_version === 2;
              const amount = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
              const expiryEnd = facts?.as_of ? new Date(Date.parse(`${facts.as_of}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10) : null;
              const expiredBatches = facts?.batches?.filter(b => b.expires && b.expires < facts.as_of) ?? [];
              const expiringBatches = facts?.batches?.filter(b => b.expires && b.expires >= facts.as_of && b.expires <= expiryEnd) ?? [];
              const purchaseWarnings = facts?.warnings?.filter(warning => !facts.forecast_issues?.includes(warning)) ?? [];

              return (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words text-sm font-medium text-foreground">
                          {s.ingredient_name}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${urgency.className}`}
                        >
                          {Number(s.suggested_quantity) === 0 ? "No purchase needed" : urgency.label}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        <p className="font-medium text-foreground">Suggested purchase: {amount(s.suggested_quantity)} {s.unit}</p>
                        <p>Expected use: {isCurrentPolicy && facts.expected_use_available ? `${amount(facts.expected_use)} ${s.unit} / 7 days${facts.forecast_complete ? "" : " (partial estimate)"}` : "Unavailable"}</p>
                        <p>Usable stock: {amount(s.current_stock)} {s.unit}</p>
                        <p><span className="font-medium text-foreground">Reason: </span>{s.reasoning}</p>
                        {s.stale_reason && <p className="text-amber-700 dark:text-amber-400">Needs refresh: {s.stale_reason}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Expandable reasoning */}
                  <button
                    className="mt-1 text-xs text-primary hover:underline"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : s.id)
                    }
                  >
                    {isExpanded ? "Hide details" : "Details"}
                  </button>
                  {isExpanded && (
                    <div className="mt-2 space-y-1 break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                      <p>Generated: {formatDate(s.created_at, "dateTime")} (Manila)</p>
                      {isCurrentPolicy && <>
                        <p>Minimum stock: {amount(facts.minimum_stock)} {s.unit}</p>
                        {Number(facts.expired_stock) > 0 && <p>Expired stock excluded: {amount(facts.expired_stock)} {s.unit}{expiredBatches.length > 0 ? ` · ${expiredBatches.map(b => `Batch #${b.batch_id}`).join(", ")}` : ""}</p>}
                        {expiringBatches.map(b => <p key={b.batch_id}>Expiring soon: Batch #{b.batch_id} · {amount(b.remaining)} {s.unit} · {formatDate(b.expires)}</p>)}
                        {purchaseWarnings.map(warning => <p key={warning} className="text-amber-700 dark:text-amber-400">{warning}</p>)}
                      </>}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-7 text-xs"
                      onClick={() => handleAccept(s)}
                      disabled={mutations.acceptReorder.isPending || mutations.generateReorder.isPending || Boolean(s.stale_reason) || !isCurrentPolicy}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleReject(s.id)}
                      disabled={mutations.rejectReorder.isPending || mutations.generateReorder.isPending}
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
