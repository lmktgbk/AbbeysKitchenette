import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OrderTimeline from "./OrderTimeline";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

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

/**
 * OrderDetailModal
 *
 * Read-only detail view for orders.
 * - Left: order info + items table + total
 * - Right: timeline with status history
 *
 * Items are NOT clickable here (kitchen handles checking).
 * Remove button available for accepted/preparing orders.
 */
export default function OrderDetailModal({
  open,
  onOpenChange,
  order,
  loading,
  onCancel,
  onRemoveItem,
  showActions = true,
}) {
  const status = STATUS_CONFIG[order?.status] || STATUS_CONFIG.pending;
  const isPending = order?.status === "pending";
  const isAccepted = order?.status === "accepted";
  const isPreparing = order?.status === "preparing";

  const canCancel = isPending || isAccepted || isPreparing;
  const canRemoveItem = isAccepted || isPreparing;

  const total = order?.items?.reduce((sum, item) => sum + Number(item.subtotal || 0), 0) || 0;

  const checkedCount = order?.items?.filter((item) => item.is_prepared).length ?? 0;
  const totalItems = order?.items?.length ?? 0;

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
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_4rem_6rem] bg-muted/50 border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span>Item</span>
                      <span className="text-center">Qty</span>
                      <span className="text-right">Subtotal</span>
                    </div>

                    {/* Items */}
                    {order?.items?.map((item) => {
                      const done = item.is_prepared;
                      const label = item.size_name
                        ? `${item.product_name} (${item.size_name})`
                        : item.product_name;

                      return (
                        <div
                          key={item.order_item_id}
                          className={cn(
                            "px-3 py-2 border-b border-border last:border-b-0",
                            done && "bg-muted/30",
                          )}
                        >
                          <div className="grid grid-cols-[1fr_4rem_6rem] items-center">
                            <div className="min-w-0">
                              <span className={cn(
                                "text-sm font-medium",
                                done && "text-muted-foreground",
                              )}>
                                {label}
                              </span>
                              {done && item.prepared_by_name && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  by {item.prepared_by_name}
                                </div>
                              )}
                            </div>
                            <span className="text-center text-sm text-muted-foreground">
                              ×{item.quantity}
                            </span>
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-sm font-medium">
                                ₱{Number(item.subtotal || 0).toLocaleString()}
                              </span>
                              {canRemoveItem && onRemoveItem && (
                                <button
                                  type="button"
                                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Remove item"
                                  onClick={() => onRemoveItem(order, item)}
                                >
                                  <Icon name="trash2" size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Total row */}
                    <div className="grid grid-cols-[1fr_4rem_6rem] items-center px-3 py-2 bg-muted/50 border-t border-border">
                      <span className="text-xs font-medium text-muted-foreground">Total</span>
                      <span />
                      <span className="text-right text-sm font-bold">
                        ₱{total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right column — Timeline */}
              <div className="w-56 shrink-0 border-l border-border pl-4">
                <OrderTimeline order={order} />
              </div>
            </div>
            </div>

            {/* Actions */}
            {showActions && canCancel && (
              <DialogFooter className="px-5 pb-5 pt-0">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onCancel?.(order)}
                >
                  <Icon name="trash2" size={14} />
                  Cancel Order
                </Button>
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
