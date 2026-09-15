import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { DropDown } from "@/components/filters/DropDown";

const CANCEL_REASONS = [
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "wrong_order", label: "Wrong order" },
  { value: "duplicate", label: "Duplicate order" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "other", label: "Other" },
];

/**
 * RemoveItemDialog
 *
 * Horizontal 2-column dialog for removing a single item from an order.
 *
 * UNCHECKED item (partially cooking, not served):
 * - Default: restore all ingredients (no loss)
 * - Optional: user can declare loss on specific ingredients
 *
 * CHECKED item (fully served):
 * - ALL ingredients are marked as loss by default
 * - User can un-mark specific ingredients
 */
export default function RemoveItemDialog({
  open,
  onOpenChange,
  item,
  orderStatus,
  onConfirm,
  loading,
}) {
  const isAccepted = orderStatus === "accepted";
  const showLossOptions = !isAccepted;
  const recipes = item?.recipes || [];
  const itemSubtotal = Number(item?.subtotal || 0);

  const [lossOption, setLossOption] = useState("no_loss");
  const [refundOption, setRefundOption] = useState("full");
  const [customRefundAmount, setCustomRefundAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [expandedIngredients, setExpandedIngredients] = useState(false);
  const [lossQuantity, setLossQuantity] = useState(0);
  const [ingredientLosses, setIngredientLosses] = useState({});
  const [manualOverrides, setManualOverrides] = useState(new Set());

  const prevItemId = item?.order_item_id;
  const [lastItemId, setLastItemId] = useState(null);
  if (prevItemId !== lastItemId) {
    setLastItemId(prevItemId);
    setLossOption("no_loss");
    setRefundOption("full");
    setCustomRefundAmount("");
    setReason("");
    setReasonError("");
    setCustomReason("");
    setExpandedIngredients(false);
    setLossQuantity(0);
    setIngredientLosses({});
    setManualOverrides(new Set());
  }

  const totalLossCost = useMemo(() => {
    let cost = 0;
    for (const [ingId, qty] of Object.entries(ingredientLosses)) {
      const recipe = recipes.find((r) => r.ingredient_id === ingId);
      if (recipe) {
        cost += Number(qty) * recipe.cost_per_unit;
      }
    }
    return cost;
  }, [ingredientLosses, recipes]);

  const refundAmount = useMemo(() => {
    if (refundOption === "full") return itemSubtotal;
    if (refundOption === "none") return 0;
    const parsed = parseFloat(customRefundAmount);
    if (!isNaN(parsed) && parsed >= 0) return Math.min(parsed, itemSubtotal);
    return 0;
  }, [refundOption, itemSubtotal, customRefundAmount]);

  if (!item) return null;

  function toggleIngredientLoss(ingredientId, quantityNeeded) {
    setIngredientLosses((prev) => {
      const next = { ...prev };
      if (next[ingredientId] !== undefined) {
        delete next[ingredientId];
      } else {
        next[ingredientId] = quantityNeeded;
      }
      return next;
    });
    setManualOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) {
        next.delete(ingredientId);
      } else {
        next.add(ingredientId);
      }
      return next;
    });
  }

  function updateIngredientQty(ingredientId, qty) {
    if (qty === "") return;
    const val = parseFloat(qty);
    setIngredientLosses((prev) => {
      const next = { ...prev };
      if (isNaN(val) || val <= 0) {
        delete next[ingredientId];
      } else {
        next[ingredientId] = val;
      }
      return next;
    });
    setManualOverrides((prev) => new Set(prev).add(ingredientId));
  }

  function adjustLossQuantity(delta) {
    const max = item?.quantity || 1;
    setLossQuantity((prev) => {
      const next = Math.max(0, Math.min(max, prev + delta));
      if (next <= 0) {
        setIngredientLosses({});
        setManualOverrides(new Set());
      } else {
        setIngredientLosses((prevLosses) => {
          const nextLosses = {};
          for (const recipe of recipes) {
            if (manualOverrides.has(recipe.ingredient_id) && prevLosses[recipe.ingredient_id] !== undefined) {
              nextLosses[recipe.ingredient_id] = prevLosses[recipe.ingredient_id];
            } else {
              nextLosses[recipe.ingredient_id] = recipe.quantity_needed * next;
            }
          }
          return nextLosses;
        });
      }
      return next;
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

    const lossesArray = lossOption === "with_loss"
      ? Object.entries(ingredientLosses).map(([ingId, qty]) => ({
          ingredient_id: ingId,
          quantity_lost: qty,
        }))
      : [];

    const parsedCustom = parseFloat(customRefundAmount);
    const hasOverride = refundOption === "partial" && !isNaN(parsedCustom) && parsedCustom >= 0;

    onConfirm?.({
      reason,
      custom_reason: reason === "other" ? customReason.trim() : undefined,
      loss_option: lossOption,
      refund_option: refundOption,
      refund_amount: hasOverride ? Math.min(parsedCustom, itemSubtotal) : undefined,
      ingredient_losses: lossesArray,
    });
  }

  const label = item.size_name
    ? `${item.product_name} (${item.size_name})`
    : item.product_name;

  const lossCount = Object.keys(ingredientLosses).length;

  function handleDialogChange(isOpen) {
    if (!isOpen) {
      setLossOption("no_loss");
      setRefundOption("full");
      setCustomRefundAmount("");
      setReason("");
      setReasonError("");
      setCustomReason("");
      setExpandedIngredients(false);
      setLossQuantity(0);
      setIngredientLosses({});
      setManualOverrides(new Set());
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Remove {label}?
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-4">
          {/* ── Left Column (3 cols) ── */}
          <div className="col-span-3 space-y-4">
            {/* Item summary */}
            <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2">
              <div>
                <p className="font-medium">{label}</p>
                {lossOption === "with_loss" ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">Loss qty:</span>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="w-4 h-4 rounded border border-border flex items-center justify-center hover:bg-muted/80 transition-colors disabled:opacity-30"
                        onClick={() => adjustLossQuantity(-1)}
                        disabled={lossQuantity <= 0}
                      >
                        <Icon name="minus" size={10} />
                      </button>
                      <span className="text-xs font-medium w-4 text-center tabular-nums">
                        {lossQuantity}
                      </span>
                      <button
                        type="button"
                        className="w-4 h-4 rounded border border-border flex items-center justify-center hover:bg-muted/80 transition-colors disabled:opacity-30"
                        onClick={() => adjustLossQuantity(1)}
                        disabled={lossQuantity >= (item?.quantity || 1)}
                      >
                        <Icon name="plus" size={10} />
                      </button>
                      <span className="text-[10px] text-muted-foreground">/ {item?.quantity || 1}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Qty: {item?.quantity}</p>
                )}
              </div>
              <p className="font-semibold">₱{itemSubtotal.toLocaleString()}</p>
            </div>

            {/* Status message */}
            {isAccepted ? (
              <p className="text-xs text-muted-foreground">
                This order has not started preparation. All ingredients will be restored.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This item is being prepared. Ingredients may have been partially used.
              </p>
            )}

            {/* Loss options for unchecked items */}
            {showLossOptions && (
              <div className="space-y-2">
                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-all",
                    lossOption === "no_loss"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80 hover:bg-muted/50",
                  )}
                  onClick={() => setLossOption("no_loss")}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                    lossOption === "no_loss"
                      ? "border-primary bg-primary"
                      : "border-border",
                  )}>
                    {lossOption === "no_loss" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                  <Icon name="check" size={16} className="text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-foreground">No Loss</div>
                    <div className="text-[11px] text-muted-foreground">Restore all ingredients</div>
                  </div>
                </button>

                <button
                  type="button"
                  className={cn(
                    "flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-lg border transition-all",
                    lossOption === "with_loss"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border/80 hover:bg-muted/50",
                  )}
                  onClick={() => setLossOption("with_loss")}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                    lossOption === "with_loss"
                      ? "border-primary bg-primary"
                      : "border-border",
                  )}>
                    {lossOption === "with_loss" && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                  <Icon name="trendingDown" size={16} className="text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-foreground">With Loss</div>
                    <div className="text-[11px] text-muted-foreground">Declare ingredients that were used</div>
                  </div>
                </button>
              </div>
            )}

            {/* Ingredient picker */}
            {lossOption === "with_loss" && recipes.length > 0 && (
              <div className="space-y-2 border border-border rounded-lg p-3">
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
                  onClick={() => setExpandedIngredients(!expandedIngredients)}
                >
                  <Icon
                    name={expandedIngredients ? "chevronDown" : "chevronRight"}
                    size={14}
                    className="shrink-0"
                  />
                  <span>Ingredients</span>
                  <span className="text-[10px] normal-case tracking-normal font-normal">
                    — select used
                  </span>
                  {lossCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium ml-auto">
                      {lossCount}
                    </span>
                  )}
                </button>

                {expandedIngredients && (
                  <div className="space-y-1.5 pt-1">
                    {recipes.map((recipe) => {
                      const isChecked = ingredientLosses[recipe.ingredient_id] !== undefined;
                      const qty = ingredientLosses[recipe.ingredient_id] ?? recipe.quantity_needed * (item?.quantity || 1);
                      const lossCost = qty * recipe.cost_per_unit;

                      return (
                        <div key={recipe.ingredient_id} className="flex items-center gap-2">
                          <button
                            type="button"
                            className={cn(
                              "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all",
                              isChecked
                                ? "bg-destructive/10 border-destructive/25"
                                : "border-border",
                            )}
                            onClick={() => toggleIngredientLoss(
                              recipe.ingredient_id,
                              recipe.quantity_needed * (item?.quantity || 1),
                            )}
                          >
                            {isChecked && <Icon name="check" size={8} className="text-destructive" />}
                          </button>

                          <span className={cn(
                            "text-xs flex-1 min-w-0 truncate",
                            isChecked ? "text-foreground" : "text-muted-foreground",
                          )}>
                            {recipe.ingredient_name || recipe.ingredient_id}
                          </span>

                          {isChecked ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <Input
                                type="number"
                                value={qty}
                                onChange={(e) => updateIngredientQty(
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
                              {recipe.quantity_needed * (item?.quantity || 1)} {recipe.unit || "g"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right Column (2 cols) ── */}
          <div className="col-span-2 space-y-4">
            {/* Reason */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Reason</label>
              <DropDown
                options={CANCEL_REASONS}
                value={reason}
                onChange={(val) => { setReason(val); setReasonError(""); }}
                placeholder="Select reason..."
                size="sm"
                className={cn(reasonError && "[&>button]:border-destructive")}
              />
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
                <span className="text-sm font-medium text-foreground flex-1">Full Refund</span>
                <span className="text-xs font-semibold text-primary">₱{itemSubtotal.toLocaleString()}</span>
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
                <span className="text-sm font-medium text-foreground shrink-0">Partial</span>
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
                      max={itemSubtotal}
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
                <span className="text-sm font-medium text-foreground flex-1">No Refund</span>
                <span className="text-xs font-semibold text-muted-foreground">₱0</span>
              </button>
            </div>

            {/* Refund summary */}
            <div className="bg-muted/50 rounded-lg px-3 py-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">₱{itemSubtotal.toLocaleString()}</span>
              </div>
              {refundOption === "partial" && customRefundAmount && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">You enter</span>
                  <span className="font-medium text-primary">₱{parseFloat(customRefundAmount).toLocaleString()}</span>
                </div>
              )}
              {lossOption === "with_loss" && totalLossCost > 0 && (
                <>
                  <div className="border-t border-border/60 my-1" />
                  <div className="flex justify-between text-xs">
                    <span className="text-destructive font-semibold">Ingredient Loss</span>
                    <span className="text-destructive font-semibold">₱{totalLossCost.toLocaleString()}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-xs font-semibold border-t border-border/60 pt-1">
                <span className="text-primary">Refund</span>
                <span className="text-primary">₱{refundAmount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDialogChange(false)}
            disabled={loading}
          >
            Keep Item
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
            {loading ? "Removing..." : "Remove Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
