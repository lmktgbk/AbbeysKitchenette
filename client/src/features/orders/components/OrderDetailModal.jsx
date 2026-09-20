import { useState, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/date";
import { orderNumberLabel } from "@/lib/orderNumber";
import { printReceipt } from "@/features/receipts/api";
import gcashLogo from "@/assets/gcash-logo.png";
import mayaLogo from "@/assets/maya_logo.png";

const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  preparing: { label: "Preparing", variant: "orange" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const SOURCE_CONFIG = {
  walk_in: { label: "Walk-in", icon: "user" },
  online: { label: "Online", icon: "send" },
};

const REMOVED_REASONS = {
  customer_changed_mind: "Customer changed mind",
  wrong_order: "Wrong order",
  duplicate: "Duplicate order",
  out_of_stock: "Out of stock",
  other: "Other",
};

/**
 * OrderDetailModal
 *
 * Read-only detail view for orders.
 * - Left: order info + items table (expandable rows) + total
 * - Right: timeline with status history
 *
 * Items are NOT clickable here (kitchen handles checking).
 * Remove button available for accepted/preparing orders.
 * Click on prepared/removed items to expand detail rows.
 */
export default function OrderDetailModal({
  open,
  onOpenChange,
  order,
  loading,
  onCancel,
  onAdvance,
  onRemoveItem,
  showActions = true,
}) {
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [copiedId, setCopiedId] = useState(false);

  async function handleCopyId() {
    if (!order?.order_id) return;
    try {
      await navigator.clipboard.writeText(order.order_id);
    } catch {
      // clipboard unavailable (permissions/iframe) — still show feedback
    }
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  }

  const toggleItem = (id) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const status = STATUS_CONFIG[order?.status] || STATUS_CONFIG.pending;
  const isPending = order?.status === "pending";
  const isAccepted = order?.status === "accepted";
  const isPreparing = order?.status === "preparing";

  const canCancel = isPending || isAccepted || isPreparing;
  const canAdvance = isPending || isAccepted;
  const canRemoveItem = isAccepted || isPreparing;
  const isPaid = !!order?.status && order.status !== "pending";

  const total = order?.items?.filter((i) => !i.is_removed).reduce((sum, item) => sum + Number(item.subtotal || 0), 0) || 0;
  const removedTotal = order?.items?.filter((i) => i.is_removed).reduce((sum, item) => sum + Number(item.subtotal || 0), 0) || 0;

  const checkedCount = order?.items?.filter((item) => item.is_prepared && !item.is_removed).length ?? 0;
  const totalItems = order?.items?.filter((item) => !item.is_removed).length ?? 0;
  const allPrepared = totalItems > 0 && checkedCount === totalItems;

  const source = SOURCE_CONFIG[order?.order_source] || SOURCE_CONFIG.walk_in;

  if (!order && !loading) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[85vh]">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2">
            {loading ? (
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            ) : (
              <>
                Order {orderNumberLabel(order?.order_number)}
                <Badge variant={status.variant}>{status.label}</Badge>
                <Badge variant="outline" className="gap-1">
                  <Icon name={source.icon} size={10} />
                  {source.label}
                </Badge>
              </>
            )}
          </DialogTitle>
          {!loading && order?.order_id && (
            <p className="-mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="font-mono break-all">Order ID: {order.order_id}</span>
              <button
                type="button"
                title={copiedId ? "Copied!" : "Copy order ID"}
                onClick={handleCopyId}
                className="shrink-0 cursor-pointer rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon name={copiedId ? "check" : "copy"} size={10} />
              </button>
            </p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4 px-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-3 modal-scroll">
              <div className="space-y-3">
                <StatusStepper order={order} />

                {/* Meta grid — customer, table, payment as stacked cells */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer Name</p>
                    <p className="truncate text-sm font-semibold" title={order?.customer_name}>{order?.customer_name || "—"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Table</p>
                    <p className="truncate text-sm font-semibold" title={order?.table_number}>{order?.table_number || "—"}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Payment</p>
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                      <PaymentMethodMark method={order?.payment_method} />
                      <span className="truncate capitalize">{order?.payment_method || "cash"}</span>
                      {order?.reference_no && (
                        <span className="max-w-[100px] truncate font-mono font-normal text-muted-foreground" title={order.reference_no}>
                          ({order.reference_no})
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Payment stat strip */}
                <div className="rounded-lg border border-border bg-muted/40">
                  <div className="grid grid-cols-5 divide-x divide-border py-2 text-center">
                    <StatCell
                      label="Subtotal"
                      value={`₱${Number(order?.subtotal_amount ?? order?.total_amount ?? 0).toLocaleString()}`}
                    />
                    <StatCell
                      label="Discount"
                      value={order?.discount_type && order.discount_type !== "none"
                        ? `−₱${Number(order.discount_amount || 0).toLocaleString()}`
                        : "—"
                      }
                      valueClassName={order?.discount_type && order.discount_type !== "none" ? "text-green-600 dark:text-green-400" : ""}
                      hint={discountTag(order)}
                    />
                    <StatCell
                      label="Total"
                      value={`₱${Number(order?.total_amount ?? 0).toLocaleString()}`}
                      valueClassName="text-base font-bold"
                    />
                    <StatCell
                      label="Paid"
                      value={order?.amount_paid != null
                        ? `₱${Number(order.amount_paid).toLocaleString()}`
                        : "—"
                      }
                    />
                    <StatCell
                      label="Change"
                      value={order?.change != null
                        ? `₱${Number(order.change).toLocaleString()}`
                        : "—"
                      }
                    />
                  </div>
                  {(Number(order?.refund?.amount || 0) > 0) && (
                    <p className="border-t border-border px-4 py-1.5 text-right text-xs font-semibold text-destructive">
                      Refunded ₱{Number(order.refund.amount).toLocaleString()}
                    </p>
                  )}
                  {discountDetail(order) && (
                    <p className="border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Discount:</span> {discountDetail(order)}
                    </p>
                  )}
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Items
                    </p>
                    {isPreparing && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {checkedCount}/{totalItems} prepared
                      </span>
                    )}
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table noOverflow className="text-xs">
                      <TableHeader>
                        <TableRow className="hover:bg-muted/50">
                          <TableHead>Item</TableHead>
                          <TableHead className="text-center w-12">Qty</TableHead>
                          <TableHead className="text-right w-20">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order?.items?.map((item) => {
                          const done = item.is_prepared;
                          const removed = item.is_removed;
                          const expandable = done || removed || item.removed_loss_option;
                          const isExpanded = expandedItems.has(item.order_item_id);
                          const label = item.size_name
                            ? `${item.product_name} (${item.size_name})`
                            : item.product_name;

                          return (
                            <Fragment key={item.order_item_id}>
                              <TableRow
                                className={cn(
                                  removed && "bg-destructive/5 opacity-60 hover:bg-destructive/5",
                                  done && !removed && "bg-muted/30",
                                  expandable && "cursor-pointer",
                                )}
                                onClick={expandable ? () => toggleItem(item.order_item_id) : undefined}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {removed ? (
                                      <div className="w-4 h-4 rounded-full border-2 border-destructive bg-destructive/10 flex items-center justify-center shrink-0">
                                        <Icon name="minus" size={9} className="text-destructive" />
                                      </div>
                                    ) : (
                                      <div className={cn(
                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                        done
                                          ? "border-green-500 bg-green-500 text-white"
                                          : "border-border",
                                      )}>
                                        {done && <Icon name="check" size={9} />}
                                      </div>
                                    )}
                                    <span className={cn(
                                      "truncate",
                                      removed && "text-muted-foreground line-through",
                                      done && !removed && "text-muted-foreground",
                                    )}>
                                      {label}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className={cn(
                                  "text-center",
                                  removed && "text-muted-foreground line-through",
                                )}>
                                  ×{item.quantity}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <span className={cn(
                                      "text-right font-medium",
                                      removed && "text-muted-foreground line-through",
                                    )}>
                                      ₱{Number(item.subtotal || 0).toLocaleString()}
                                    </span>
                                    {canRemoveItem && onRemoveItem && !removed && !done && (
                                      <button
                                        type="button"
                                        className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                        title="Remove item"
                                        onClick={(e) => { e.stopPropagation(); onRemoveItem(order, item); }}
                                      >
                                        <Icon name="trash2" size={12} />
                                      </button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>

                              {isExpanded && expandable && (
                                <TableRow className="bg-muted/20 hover:bg-muted/20">
                                  <TableCell colSpan={3} className="py-2 pl-8">
                                    {removed ? (
                                      <div className="space-y-0.5 text-[10px]">
                                        <p className="text-destructive font-semibold">Removed</p>
                                        {item.removed_reason && (
                                          <p className="text-muted-foreground">
                                            <span className="font-medium">Reason:</span> {REMOVED_REASONS[item.removed_reason] || item.removed_reason}
                                          </p>
                                        )}
                                        {item.removed_by && (
                                          <p className="text-muted-foreground">
                                            <span className="font-medium">By:</span> {item.removed_by.name} ({item.removed_by.role})
                                          </p>
                                        )}
                                        {item.removed_at && (
                                          <p className="text-muted-foreground">
                                            <span className="font-medium">Date:</span> {formatDate(item.removed_at, "shortDate")} {formatTime(item.removed_at)}
                                          </p>
                                        )}
                                        {item.removed_loss_option === "with_loss" && item.ingredient_loss_cost > 0 ? (
                                          <p className="text-destructive font-semibold">
                                            Ingredient Loss: ₱{Number(item.ingredient_loss_cost).toLocaleString()}
                                          </p>
                                        ) : (
                                          <p className="text-muted-foreground">No Loss</p>
                                        )}
                                        <p className="text-muted-foreground font-medium">
                                          Refund: ₱{Number(item.subtotal || 0).toLocaleString()}
                                        </p>
                                      </div>
                                    ) : done ? (
                                      <div className="space-y-0.5 text-[10px]">
                                        {item.prepared_by_name && (
                                          <p className="text-muted-foreground">
                                            <span className="font-medium">Prepared by:</span> {item.prepared_by_name}
                                            {item.prepared_by_role && ` (${item.prepared_by_role})`}
                                          </p>
                                        )}
                                        {item.prepared_at && (
                                          <p className="text-muted-foreground">
                                            <span className="font-medium">Date:</span> {formatDate(item.prepared_at, "shortDate")} {formatTime(item.prepared_at)}
                                          </p>
                                        )}
                                        {item.removed_loss_option === "with_loss" && item.ingredient_loss_cost > 0 ? (
                                          <p className="text-destructive font-semibold">
                                            Ingredient Loss: ₱{Number(item.ingredient_loss_cost).toLocaleString()}
                                          </p>
                                        ) : item.removed_loss_option ? (
                                          <p className="text-muted-foreground">No Loss</p>
                                        ) : null}
                                      </div>
                                    ) : item.removed_loss_option ? (
                                      <div className="space-y-0.5 text-[10px]">
                                        {item.removed_loss_option === "with_loss" && item.ingredient_loss_cost > 0 ? (
                                          <p className="text-destructive font-semibold">
                                            Ingredient Loss: ₱{Number(item.ingredient_loss_cost).toLocaleString()}
                                          </p>
                                        ) : (
                                          <p className="text-muted-foreground">No Loss</p>
                                        )}
                                        <p className="text-muted-foreground font-medium">
                                          Refund: ₱{(() => {
                                            const refundAmt = Number(order?.refund?.amount || 0);
                                            const totalAmt = Number(order?.total_amount || 0);
                                            const itemAmt = Number(item.subtotal || 0);
                                            return totalAmt > 0 ? Math.round((itemAmt / totalAmt) * refundAmt).toLocaleString() : "0";
                                          })()}
                                        </p>
                                      </div>
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}

                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell className="text-[11px] font-medium text-muted-foreground">Total</TableCell>
                          <TableCell />
                          <TableCell className="text-right text-xs font-bold">
                            ₱{total.toLocaleString()}
                          </TableCell>
                        </TableRow>
                        {removedTotal > 0 && (
                          <TableRow className="bg-destructive/5 hover:bg-destructive/5">
                            <TableCell className="text-[11px] font-medium text-destructive">Removed</TableCell>
                            <TableCell />
                            <TableCell className="text-right text-[11px] font-semibold text-destructive line-through">
                              ₱{removedTotal.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {showActions && (canCancel || canAdvance || (allPrepared && isPreparing) || isPaid) && (
              <DialogFooter className="px-5 pb-4 pt-3 mt-2">
                {isPaid && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => printReceipt(order?.order_id)}
                  >
                    <Icon name="receipt" size={14} />
                    Print receipt
                  </Button>
                )}
                {allPrepared && isPreparing && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onAdvance?.(order)}
                  >
                    <Icon name="check" size={14} />
                    Complete Order
                  </Button>
                )}
                {canCancel && checkedCount > 0 && !allPrepared && (
                  <p className="text-[10px] text-muted-foreground w-full mb-1">
                    Cannot cancel order — {checkedCount} item(s) have been served. Uncheck served items first, or remove unserved items to proceed.
                  </p>
                )}
                {canCancel && checkedCount === 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onCancel?.(order)}
                  >
                    <Icon name="trash2" size={14} />
                    Cancel Order
                  </Button>
                )}
                {isPending && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onAdvance?.(order)}
                  >
                    <Icon name="check" size={14} />
                    Accept
                  </Button>
                )}
                {isAccepted && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onAdvance?.(order)}
                  >
                    <Icon name="play" size={14} />
                    Start Preparing
                  </Button>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCell({ label, value, valueClassName, hint }) {
  return (
    <div className="px-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", valueClassName)}>{value}</p>
      {hint && (
        <p className="truncate text-[10px] text-muted-foreground" title={hint}>{hint}</p>
      )}
    </div>
  );
}

/**
 * StatusStepper — horizontal 4-step progress (Created → Accepted →
 * Preparing → Completed) with timestamp + actor under each step.
 * Cancelled orders show a red badge with the cancel time.
 */
function StatusStepper({ order }) {
  const formatActor = (by) => {
    if (!by) return null;
    if (typeof by === "string") return by;
    return by.name + (by.role ? ` (${by.role})` : "");
  };
  const stepInfo = (at, by) => ({
    at: at ? `${formatDate(at, "shortDate")} ${formatTime(at)}` : null,
    by: formatActor(by),
  });
  const steps = [
    { key: "created", label: "Created", done: true, ...stepInfo(order?.created_at, order?.creator_name && { name: order.creator_name, role: order?.creator_role }) },
    { key: "accepted", label: "Accepted", done: !!(order?.accepted_at || order?.accepted_by), ...stepInfo(order?.accepted_at, order?.accepted_by) },
    { key: "preparing", label: "Preparing", done: !!(order?.preparing_at || order?.preparing_by), ...stepInfo(order?.preparing_at, order?.preparing_by) },
    { key: "completed", label: "Completed", done: !!(order?.completed_at || order?.completed_by), ...stepInfo(order?.completed_at, order?.completed_by) },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  const isCancelled = order?.status === "cancelled";
  const cancelledAt = order?.cancelled_at ? `${formatDate(order.cancelled_at, "shortDate")} ${formatTime(order.cancelled_at)}` : null;

  return (
    <div className="flex items-center" aria-label="Order status">
      {steps.map((step, i) => {
        const isCurrent = !isCancelled && i === currentIdx;
        return (
          <div key={step.key} className="flex min-w-0 flex-1 items-start last:flex-none">
            <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
                step.done
                  ? "border-green-500 bg-green-500 text-white"
                  : isCurrent
                    ? "border-primary bg-primary/10"
                    : "border-border",
              )}>
                {step.done && <Icon name="check" size={11} />}
                {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </span>
              <span className={cn(
                "text-[10px] leading-tight",
                step.done ? "font-semibold text-foreground" : isCurrent ? "font-semibold text-primary" : "text-muted-foreground",
              )}>
                {step.label}
              </span>
              <span className="w-full truncate text-[10px] leading-tight text-muted-foreground" title={step.at ?? undefined}>
                {step.at ?? "—"}
              </span>
              {step.by && (
                <span className="w-full truncate text-[10px] leading-tight text-muted-foreground" title={step.by}>
                  {step.by}
                </span>
              )}
            </div>
            {i < steps.length - 1 && (
              <span className={cn(
                "mx-1.5 mt-2.5 h-px flex-1",
                steps[i + 1].done ? "bg-green-500" : "bg-border",
              )} />
            )}
          </div>
        );
      })}
      {isCancelled && (
        <div className="ml-2 flex shrink-0 flex-col items-center gap-0.5 text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            <Icon name="x" size={10} />
            Cancelled
          </span>
          {cancelledAt && (
            <span className="text-[10px] leading-tight text-muted-foreground" title={cancelledAt}>
              {cancelledAt}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Short tag for the discount stat cell (fits the narrow column).
 * Senior/PWD show the ID number, promo shows mode + label.
 */
function discountTag(order) {
  if (!order?.discount_type || order.discount_type === "none") return null;
  if (order.discount_type === "senior") return "Senior";
  if (order.discount_type === "pwd") return "PWD";
  const mode = Number(order.discount_percent) > 0 ? `${order.discount_percent}%` : "fixed";
  return `Promo ${mode}`;
}

/**
 * Full audit detail for the caption line under the stat strip.
 * Full modal width — long IDs and labels display in full.
 */
function discountDetail(order) {
  if (!order?.discount_type || order.discount_type === "none") return null;
  if (order.discount_type === "senior" || order.discount_type === "pwd") {
    const tag = order.discount_type === "senior" ? "Senior" : "PWD";
    return order.discount_id_no ? `${tag} · ID ${order.discount_id_no}` : tag;
  }
  const mode = Number(order.discount_percent) > 0 ? `${order.discount_percent}%` : "fixed amount";
  return order.discount_label ? `Promo ${mode} · ${order.discount_label}` : `Promo ${mode}`;
}

/**
 * Small brand mark for the payment method badge.
 * GCash/Maya use the store logos, cash/card use lucide icons.
 */
function PaymentMethodMark({ method }) {
  if (method === "gcash") {
    return <img src={gcashLogo} alt="GCash" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-3.5 w-auto object-contain" />;
  }
  if (method === "maya") {
    return <img src={mayaLogo} alt="Maya" onError={(e) => { e.currentTarget.style.display = "none"; }} className="h-3.5 w-auto object-contain" />;
  }
  if (method === "card") {
    return <Icon name="creditCard" size={13} className="text-muted-foreground" />;
  }
  return <Icon name="banknote" size={13} className="text-muted-foreground" />;
}
