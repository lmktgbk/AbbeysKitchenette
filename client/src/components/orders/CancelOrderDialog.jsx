import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const LOSS_OPTIONS = [
  {
    value: "no_loss",
    label: "No Loss",
    description: "Restore all ingredients, full refund",
    icon: "check",
  },
  {
    value: "with_loss",
    label: "With Loss",
    description: "Declare lost ingredients per item, refund is independent",
    icon: "trendingDown",
  },
];

const CANCEL_REASONS = [
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "wrong_order", label: "Wrong order" },
  { value: "duplicate", label: "Duplicate order" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "other", label: "Other" },
];

/**
 * CancelOrderDialog
 *
 * Horizontal 2-column dialog for cancelling orders with per-item loss support.
 * Shows ALL items (checked + unchecked) with status badges.
 */
export default function CancelOrderDialog({
  open,
  onOpenChange,
  order,
  onConfirm,
  loading,
}) {
  const [lossOption, setLossOption] = useState("no_loss");
  const [refundOption, setRefundOption] = useState("full");
  const [customRefundAmount, setCustomRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [itemLosses, setItemLosses] = useState({});

  const isPreparing = order?.status === "preparing";
  const allItems = order?.items || [];
  const checkedItems = useMemo(() => allItems.filter((i) => i.is_prepared), [allItems]);
  const uncheckedItems = useMemo(() => allItems.filter((i) => !i.is_prepared), [allItems]);
  const showLossOptions = isPreparing;

  const totalAmount = Number(order?.total_amount || 0);

  const totalLossCost = useMemo(() => {
    let cost = 0;
    for (const [itemId, losses] of Object.entries(itemLosses)) {
      const item = order?.items?.find((i) => i.order_item_id === Number(itemId));
      if (!item) continue;
      for (const [ingId, qty] of Object.entries(losses)) {
        const recipe = item.recipes?.find((r) => r.ingredient_id === ingId);
        if (recipe) {
          cost += Number(qty) * recipe.cost_per_unit;
        }
      }
    }
    return cost;
  }, [itemLosses, order?.items]);

  const refundAmount = useMemo(() => {
    if (refundOption === "full") return totalAmount;
    if (refundOption === "none") return 0;
    const parsed = parseFloat(customRefundAmount);
    if (!isNaN(parsed) && parsed >= 0) return Math.min(parsed, totalAmount);
    return 0;
  }, [refundOption, totalAmount, customRefundAmount]);

  if (!order) return null;

  function toggleItemExpand(itemId) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleIngredientLoss(itemId, ingredientId, quantityNeeded) {
    setItemLosses((prev) => {
      const itemLosses = { ...prev };
      const itemLoss = { ...(itemLosses[itemId] || {}) };

      if (itemLoss[ingredientId] !== undefined) {
        delete itemLoss[ingredientId];
      } else {
        itemLoss[ingredientId] = quantityNeeded;
      }

      if (Object.keys(itemLoss).length === 0) {
        delete itemLosses[itemId];
      } else {
        itemLosses[itemId] = itemLoss;
      }
      return itemLosses;
    });
  }

  function updateIngredientQty(itemId, ingredientId, qty) {
    const val = parseFloat(qty);
    setItemLosses((prev) => {
      const itemLosses = { ...prev };
      const itemLoss = { ...(itemLosses[itemId] || {}) };
      if (isNaN(val) || val <= 0) {
        delete itemLoss[ingredientId];
      } else {
        itemLoss[ingredientId] = val;
      }
      if (Object.keys(itemLoss).length === 0) {
        delete itemLosses[itemId];
      } else {
        itemLosses[itemId] = itemLoss;
      }
      return itemLosses;
    });
  }

  function handleConfirm() {
    if (!reason) {
      setReasonError("Please select a reason");
      return;
    }
    if (reason === "other" && !customReason.trim()) {
      setReasonError("Please specify a reason");
      return;
    }

    const itemLossesArray = lossOption === "with_loss"
      ? Object.entries(itemLosses).map(([itemId, losses]) => ({
          order_item_id: Number(itemId),
          ingredient_losses: Object.entries(losses).map(([ingId, qty]) => ({
            ingredient_id: ingId,
            quantity_lost: qty,
          })),
        }))
      : [];

    const finalReason = reason === "other" ? customReason.trim() : reason;

    const parsedCustom = parseFloat(customRefundAmount);
    const hasOverride = refundOption === "partial" && !isNaN(parsedCustom) && parsedCustom >= 0;

    onConfirm?.({
      loss_option: lossOption,
      refund_option: refundOption,
      refund_amount: hasOverride ? Math.min(parsedCustom, totalAmount) : undefined,
      reason: finalReason,
      item_losses: itemLossesArray,
    });
  }

  const allItemRows = allItems.map((item) => {
    const label = item.size_name
      ? `${item.product_name} (${item.size_name})`
      : item.product_name;
    const isExpanded = expandedItems.has(item.order_item_id);
    const itemLoss = itemLosses[item.order_item_id] || {};
    const lossCount = Object.keys(itemLoss).length;
    const isChecked = item.is_prepared;

    return { item, label, isExpanded, itemLoss, lossCount, isChecked };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Cancel Order #{order.order_number}?
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="text-sm text-muted-foreground">
          {isPreparing
            ? `${checkedItems.length} served, ${uncheckedItems.length} still preparing. Choose how to handle cancellation:`
            : order.status === "accepted"
              ? "Order accepted but not started. All ingredients will be restored."
              : "Cancel this order?"}
        </div>

        <div className="grid grid-cols-5 gap-4">
          {/* ── Left Column (3 cols) ── */}
          <div className="col-span-3 space-y-4">
            {/* Loss options */}
            {showLossOptions && (
              <div className="space-y-2">
                {LOSS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-all",
                      lossOption === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border/80 hover:bg-muted/50",
                    )}
                    onClick={() => setLossOption(opt.value)}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                      lossOption === opt.value
                        ? "border-primary bg-primary"
                        : "border-border",
                    )}>
                      {lossOption === opt.value && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                    <Icon name={opt.icon} size={16} className="text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Item list with ingredient pickers */}
            {showLossOptions && lossOption === "with_loss" && (
              <div className="space-y-2 border border-border rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Items — select lost ingredients
                </p>

                {allItemRows.map(({ item, label, isExpanded, itemLoss, lossCount, isChecked }) => (
                  <div key={item.order_item_id} className="border border-border/60 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                      onClick={() => toggleItemExpand(item.order_item_id)}
                    >
                      <Icon
                        name={isExpanded ? "chevronDown" : "chevronRight"}
                        size={14}
                        className="text-muted-foreground shrink-0"
                      />
                      <span className="text-sm font-medium flex-1">{label}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        isChecked
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-500",
                      )}>
                        {isChecked ? "Served" : "Preparing"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">×{item.quantity}</span>
                      {lossCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                          {lossCount} lost
                        </span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-3 py-2 border-t border-border/60 space-y-1.5">
                        {(item.recipes || []).map((recipe) => {
                          const isIngredientLoss = itemLoss[recipe.ingredient_id] !== undefined;
                          const qty = itemLoss[recipe.ingredient_id] ?? recipe.quantity_needed;
                          const lossCost = qty * recipe.cost_per_unit;

                          return (
                            <div key={recipe.ingredient_id} className="flex items-center gap-2">
                              <button
                                type="button"
                                className={cn(
                                  "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all",
                                  isIngredientLoss
                                    ? "bg-destructive/10 border-destructive/25"
                                    : "border-border",
                                )}
                                onClick={() => toggleIngredientLoss(
                                  item.order_item_id,
                                  recipe.ingredient_id,
                                  recipe.quantity_needed,
                                )}
                              >
                                {isIngredientLoss && <Icon name="check" size={8} className="text-destructive" />}
                              </button>

                              <span className={cn(
                                "text-xs flex-1 min-w-0 truncate",
                                isIngredientLoss ? "text-foreground" : "text-muted-foreground",
                              )}>
                                {recipe.ingredient_name || recipe.ingredient_id}
                              </span>

                              {isIngredientLoss ? (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Input
                                    type="number"
                                    value={qty}
                                    onChange={(e) => updateIngredientQty(
                                      item.order_item_id,
                                      recipe.ingredient_id,
                                      e.target.value,
                                    )}
                                    className="w-16 h-6 text-[11px] px-1.5 py-0"
                                    min="0"
                                    step="0.001"
                                  />
                                  <span className="text-[10px] text-muted-foreground w-6">
                                    {recipe.unit || "g"}
                                  </span>
                                  <span className="text-[10px] text-destructive font-medium w-12 text-right">
                                    ₱{lossCost.toFixed(0)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {recipe.quantity_needed} {recipe.unit || "g"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right Column (2 cols) ── */}
          <div className="col-span-2 space-y-4">
            {/* Reason */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Reason</label>
              <select
                value={reason}
                onChange={(e) => { setReason(e.target.value); setReasonError(""); }}
                className={cn(
                  "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  reasonError ? "border-destructive" : "border-border",
                )}
              >
                <option value="">Select reason...</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              {reason === "other" && (
                <Input
                  value={customReason}
                  onChange={(e) => { setCustomReason(e.target.value); setReasonError(""); }}
                  placeholder="Specify reason..."
                  className={cn("text-sm mt-2", reasonError && "border-destructive")}
                />
              )}
              {reasonError && (
                <p className="text-xs text-destructive mt-1">{reasonError}</p>
              )}
            </div>

            {/* Refund option */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Refund</label>

              {/* Full */}
              <button
                type="button"
                className={cn(
                  "flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg border transition-all",
                  refundOption === "full"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/50",
                )}
                onClick={() => { setRefundOption("full"); setCustomRefundAmount(""); }}
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  refundOption === "full" ? "border-primary bg-primary" : "border-border",
                )}>
                  {refundOption === "full" && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                </div>
                <span className="text-sm font-medium flex-1">Full Refund</span>
                <span className="text-xs font-semibold text-primary">₱{totalAmount.toLocaleString()}</span>
              </button>

              {/* Partial */}
              <div
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2 rounded-lg border transition-all cursor-pointer",
                  refundOption === "partial"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/50",
                )}
                onClick={() => setRefundOption("partial")}
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  refundOption === "partial" ? "border-primary bg-primary" : "border-border",
                )}>
                  {refundOption === "partial" && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                </div>
                <span className="text-sm font-medium shrink-0">Partial</span>
                {refundOption === "partial" ? (
                  <div className="flex items-center gap-0.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                    <span className="text-xs text-muted-foreground">₱</span>
                    <Input
                      type="number"
                      value={customRefundAmount}
                      onChange={(e) => setCustomRefundAmount(e.target.value)}
                      placeholder="0"
                      className="w-20 h-6 text-xs text-right px-1.5 py-0 font-semibold"
                      min="0"
                      max={totalAmount}
                      step="1"
                      autoFocus
                    />
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground ml-auto">
                    ₱0
                  </span>
                )}
              </div>

              {/* None */}
              <button
                type="button"
                className={cn(
                  "flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg border transition-all",
                  refundOption === "none"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/50",
                )}
                onClick={() => { setRefundOption("none"); setCustomRefundAmount(""); }}
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  refundOption === "none" ? "border-primary bg-primary" : "border-border",
                )}>
                  {refundOption === "none" && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                </div>
                <span className="text-sm font-medium flex-1">No Refund</span>
                <span className="text-xs font-semibold text-muted-foreground">₱0</span>
              </button>
            </div>

            {/* Refund summary */}
            {order.amount_paid != null && (
              <div className="bg-muted/50 rounded-lg px-3 py-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Order total</span>
                  <span className="font-medium">₱{totalAmount.toLocaleString()}</span>
                </div>
                {refundOption === "partial" && customRefundAmount && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">You enter</span>
                    <span className="font-medium text-primary">₱{parseFloat(customRefundAmount).toLocaleString()}</span>
                  </div>
                )}
                {lossOption === "with_loss" && totalLossCost > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ingredient loss</span>
                    <span className="font-medium text-muted-foreground">₱{totalLossCost.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-semibold border-t border-border/60 pt-1">
                  <span>Refund</span>
                  <span className={cn(refundOption === "none" ? "text-muted-foreground" : refundAmount < totalAmount ? "text-amber-500" : "text-primary")}>
                    ₱{refundAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Keep Order
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="trash2" size={14} />
            )}
            {loading ? "Cancelling..." : "Cancel Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
