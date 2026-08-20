import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getIngredientBatchesRequest,
  toggleBatchPriorityRequest,
  getAdjustmentHistoryRequest,
} from "../api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import PrimarySpinner from "@/components/ui/spinner";
import { toast } from "sonner";

/**
 * BatchListModal
 *
 * Tabbed modal showing:
 * - Batches tab: all restock batches with priority management
 * - History tab: adjustment history (restock + loss records)
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - ingredient: object (the ingredient)
 */
export default function BatchListModal({ open, onOpenChange, ingredient }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("batches");

  // Fetch batches
  const { data: batchesData, isLoading: batchesLoading } = useQuery({
    queryKey: ["ingredient-batches", ingredient?.ingredient_id],
    queryFn: () => getIngredientBatchesRequest(ingredient?.ingredient_id),
    enabled: open && !!ingredient?.ingredient_id,
  });

  // Fetch history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["ingredients-history", ingredient?.ingredient_id],
    queryFn: () => getAdjustmentHistoryRequest(ingredient?.ingredient_id),
    enabled: open && !!ingredient?.ingredient_id,
  });

  // Toggle priority mutation
  const priorityMutation = useMutation({
    mutationFn: ({ batchId, isPriority }) =>
      toggleBatchPriorityRequest(ingredient?.ingredient_id, batchId, isPriority),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ingredient-batches", ingredient?.ingredient_id],
      });
      toast.success("Batch priority updated");
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Failed to update priority");
    },
  });

  const batches = batchesData?.data?.batches ?? [];
  const history = historyData?.data?.history ?? [];

  if (!open || !ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Batches & History</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {ingredient.ingredient_name} — {batches.length} batch{batches.length !== 1 ? "es" : ""}
          </p>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setActiveTab("batches")}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === "batches"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Batches ({batches.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === "history"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            History ({history.length})
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "batches" ? (
            <BatchesTab
              batches={batches}
              isLoading={batchesLoading}
              ingredient={ingredient}
              onTogglePriority={(batchId, isPriority) =>
                priorityMutation.mutate({ batchId, isPriority })
              }
              isPriorityLoading={priorityMutation.isPending}
            />
          ) : (
            <HistoryTab
              history={history}
              isLoading={historyLoading}
              unit={ingredient.unit}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Batches Tab ───────────────────── */

function BatchesTab({ batches, isLoading, ingredient, onTogglePriority, isPriorityLoading }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <PrimarySpinner size="sm" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        No restock batches recorded yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {batches.map((batch) => (
        <BatchRow
          key={batch.batch_id}
          batch={batch}
          ingredient={ingredient}
          onTogglePriority={onTogglePriority}
          isPriorityLoading={isPriorityLoading}
        />
      ))}
    </div>
  );
}

function BatchRow({ batch, ingredient, onTogglePriority, isPriorityLoading }) {
  const remaining = batch.quantity_left;
  const isDepleted = remaining === 0;

  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 transition-colors ${
        batch.is_priority ? "bg-primary/5" : ""
      }`}
    >
      {/* Priority toggle */}
      <button
        onClick={() => onTogglePriority(batch.batch_id, !batch.is_priority)}
        disabled={isDepleted || isPriorityLoading}
        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm transition-colors ${
          batch.is_priority
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        } ${isDepleted ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
        title={batch.is_priority ? "Remove priority" : "Use first (priority)"}
      >
        {batch.is_priority ? "★" : "☆"}
      </button>

      {/* Batch info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {new Date(batch.restocked_at).toLocaleDateString()}
          </span>
          {batch.supplier_name && (
            <span className="text-muted-foreground">· {batch.supplier_name}</span>
          )}
        </div>
        {batch.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[200px]">
            {batch.notes}
          </p>
        )}
      </div>

      {/* Quantities */}
      <div className="text-right shrink-0">
        <p className="text-sm font-medium font-mono">
          {batch.quantity_added.toLocaleString()} {ingredient.unit}
        </p>
        <p className="text-xs text-muted-foreground">added</p>
      </div>

      <div className="text-right shrink-0 w-24">
        <p className={`text-sm font-medium font-mono ${isDepleted ? "text-muted-foreground" : "text-green-600 dark:text-green-400"}`}>
          {remaining.toLocaleString()} {ingredient.unit}
        </p>
        <p className="text-xs text-muted-foreground">remaining</p>
        <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full ${
              isDepleted ? "bg-red-500" : "bg-green-500"
            }`}
            style={{ width: `${Math.min((remaining / batch.quantity_added) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Cost */}
      <div className="text-right shrink-0 w-20">
        <p className="text-sm font-mono">₱{batch.cost_per_unit.toFixed(4)}</p>
        <p className="text-xs text-muted-foreground">per unit</p>
      </div>
    </div>
  );
}

/* ── History Tab ───────────────────── */

function HistoryTab({ history, isLoading, unit }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <PrimarySpinner size="sm" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        No adjustment history yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {history.map((entry) => (
        <HistoryRow key={entry.adjustment_id} entry={entry} unit={unit} />
      ))}
    </div>
  );
}

function HistoryRow({ entry, unit }) {
  const typeColors = {
    restock: "success",
    loss: "destructive",
    manual: "default",
    deduction: "destructive",
  };

  const isPositive = entry.quantity_changed > 0;

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Badge variant={typeColors[entry.adjustment_type] || "default"}>
        {entry.adjustment_type}
      </Badge>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={
              isPositive
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }
          >
            {isPositive ? "+" : ""}
            {entry.quantity_changed.toLocaleString()} {unit}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">
            {entry.quantity_after.toLocaleString()} {unit}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          by {entry.adjusted_by} · {new Date(entry.adjusted_at).toLocaleDateString()}
        </p>
        {entry.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground italic">
            {entry.notes}
          </p>
        )}
      </div>
    </div>
  );
}
