import { useState, Fragment } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import OrderTimeline from "./OrderTimeline";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/date";

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
                Order #{order?.order_number}
                <Badge variant={status.variant}>{status.label}</Badge>
                <Badge variant="outline" className="gap-1">
                  <Icon name={source.icon} size={10} />
                  {source.label}
                </Badge>
              </>
            )}
          </DialogTitle>
          {!loading && order?.order_id && (
            <p className="text-[10px] font-mono text-muted-foreground -mt-1">
              <span className="font-sans font-medium">Order ID:</span> {order.order_id}
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
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex gap-4">
              {/* Left column */}
              <div className="min-w-0 flex-1 space-y-4">
                {/* Order info */}
                <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Customer" value={order?.customer_name} />
                  <InfoRow label="Table" value={order?.table_number} />
                  <InfoRow
                    label="Payment"
                    value={order?.amount_paid != null
                      ? `₱${Number(order.amount_paid).toLocaleString()}`
                      : "Not collected"
                    }
                  />
                  <InfoRow
                    label="Change"
                    value={order?.change != null
                      ? `₱${Number(order.change).toLocaleString()}`
                      : "—"
                    }
                  />
                  <InfoRow
                    label="Refund"
                    value={`₱${Number(order?.refund?.amount || 0).toLocaleString()}`}
                  />
                </div>

                {/* Station Readiness */}
                {isPreparing && (
                  <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground">Station Readiness:</span>
                    <span className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                      order?.kitchen_ready
                        ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                        : "bg-muted text-muted-foreground border border-border/40"
                    )}>
                      {order?.kitchen_ready ? "✓" : "○"} Kitchen
                    </span>
                    <span className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                      order?.cashier_ready
                        ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                        : "bg-muted text-muted-foreground border border-border/40"
                    )}>
                      {order?.cashier_ready ? "✓" : "○"} Cashier
                    </span>
                  </div>
                )}

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

              {/* Right column — Timeline */}
              <div className="w-48 shrink-0 border-l border-border pl-4">
                <OrderTimeline order={order} />
              </div>
            </div>
            </div>

            {/* Actions */}
            {showActions && (canCancel || canAdvance || (allPrepared && isPreparing)) && (
              <DialogFooter className="px-5 pb-4 pt-3 mt-2">
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

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-semibold">{value || "—"}</p>
    </div>
  );
}
