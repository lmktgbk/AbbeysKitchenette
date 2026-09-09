import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OrderTimeline from "./OrderTimeline";
import { formatDate } from "@/lib/date";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  preparing: { label: "Preparing", variant: "orange" },
  completed: { label: "Completed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const SOURCE_LABELS = {
  walk_in: "Walk-in",
  online: "Online",
};

function formatActor(actor, orderSource) {
  if (!actor) return orderSource === "online" ? "Guest (Online)" : "System";
  if (typeof actor === "string") return actor;
  if (actor.name) return actor.role ? `${actor.name} (${actor.role})` : actor.name;
  return "System";
}

/**
 * OrderDetailModal
 *
 * Wide side-by-side layout: left = info + items, right = timeline.
 * When status is 'accepted' or 'preparing', shows preparation controls:
 * - accepted: "Start Preparing" button
 * - preparing: item checkboxes, progress bar, "Mark Ready" button
 */
export default function OrderDetailModal({
  open,
  onOpenChange,
  order,
  loading,
  onAdvance,
  onCancel,
  onPrepare,
  onCheckItem,
  onMarkReady,
  showActions = true,
}) {
  if (!order && !loading) return null;

  const status = STATUS_CONFIG[order?.status] || STATUS_CONFIG.pending;
  const isTerminal = order?.status === "completed" || order?.status === "cancelled";
  const isPending = order?.status === "pending";
  const isAccepted = order?.status === "accepted";
  const isPreparing = order?.status === "preparing";

  const canCancel = isPending || isAccepted || isPreparing;
  const canStartPreparing = isAccepted;
  const canMarkReady = isPreparing;

  const total = order?.items?.reduce((sum, item) => sum + Number(item.subtotal || 0), 0) || 0;

  const checkedCount = useMemo(() => {
    if (!order?.items) return 0;
    return order.items.filter((item) => item.is_prepared).length;
  }, [order?.items]);
  const totalItems = order?.items?.length ?? 0;
  const allChecked = totalItems > 0 && checkedCount === totalItems;
  const progressPct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {loading ? (
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            ) : (
              <>
                Order #{order?.order_number}
                <Badge variant={status.variant}>{status.label}</Badge>
                <Badge variant="outline">{SOURCE_LABELS[order?.order_source] || "Unknown"}</Badge>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex gap-6">
              {/* Left column */}
              <div className="min-w-0 flex-1 space-y-4">
                {/* Order info */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <InfoRow label="Customer" value={order?.customer_name} />
                  <InfoRow label="Table" value={order?.table_number} />
                  <InfoRow label="Created" value={formatDate(order?.created_at, "dateTime")} />
                  <InfoRow label="Created by" value={formatActor(order?.creator_name, order?.order_source)} />
                  {order?.accepted_by && (
                    <InfoRow label="Accepted by" value={formatActor(order?.accepted_by)} />
                  )}
                  {order?.preparing_by && (
                    <InfoRow label="Preparing by" value={formatActor(order?.preparing_by)} />
                  )}
                  {order?.completed_by && (
                    <InfoRow label="Completed by" value={formatActor(order?.completed_by)} />
                  )}
                  <InfoRow
                    label="Payment"
                    value={order?.amount_paid != null
                      ? `₱${Number(order.amount_paid).toLocaleString()}`
                      : "Not collected"
                    }
                  />
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {isPreparing ? "Items · tap to check off" : "Items"}
                    </p>
                    {isPreparing && (
                      <span className={cn(
                        "text-[10px] font-semibold",
                        allChecked ? "text-primary" : "text-muted-foreground",
                      )}>
                        {checkedCount}/{totalItems} checked
                      </span>
                    )}
                  </div>

                  {/* Prep progress bar */}
                  {isPreparing && (
                    <div className="h-1 rounded-full bg-border/60 mb-2">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          background: allChecked ? "hsl(160 50% 40%)" : "hsl(200 70% 55%)",
                          width: `${progressPct}%`,
                        }}
                      />
                    </div>
                  )}

                  <div className="rounded-lg border border-border overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_4rem_5rem] bg-muted/50 border-b border-border px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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

                      if (isPreparing) {
                        return (
                          <button
                            key={item.order_item_id}
                            type="button"
                            className={cn(
                              "flex items-center gap-2 w-full text-left px-3 py-2.5 border-b border-border last:border-b-0 transition-all",
                              "cursor-pointer hover:bg-muted/50 active:scale-[0.995]",
                              done && "opacity-50",
                            )}
                            onClick={() => onCheckItem?.(order.order_id, item.order_item_id, !done)}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
                              done
                                ? "bg-primary/10 border-primary/25"
                                : "border-border",
                            )}>
                              {done && <Icon name="check" size={12} className="text-primary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={cn(
                                "text-sm font-medium",
                                done && "line-through text-muted-foreground",
                              )}>
                                {label}
                              </div>
                              {done && item.prepared_by_name && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  by {item.prepared_by_name}
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-muted-foreground shrink-0">
                              ×{item.quantity}
                            </span>
                          </button>
                        );
                      }

                      return (
                        <div
                          key={item.order_item_id}
                          className="px-3 py-2 border-b border-border last:border-b-0"
                        >
                          <div className="grid grid-cols-[1fr_4rem_5rem] items-center">
                            <span className="text-sm font-medium">
                              {label}
                            </span>
                            <span className="text-center text-sm text-muted-foreground">
                              {item.quantity}
                            </span>
                            <span className="text-right text-sm font-medium">
                              ₱{Number(item.subtotal || 0).toLocaleString()}
                            </span>
                          </div>
                          {item.is_prepared && item.prepared_by_name && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Prepared by {item.prepared_by_name}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Total row */}
                    <div className="grid grid-cols-[1fr_4rem_5rem] items-center px-3 py-2 bg-muted/50 border-t border-border">
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
              <div className="w-52 shrink-0 border-l border-border pl-6">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                <OrderTimeline order={order} />
              </div>
            </div>

            {/* Actions */}
            {showActions && (
              <DialogFooter>
                {canCancel && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onCancel?.(order)}
                  >
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
                    Accept Order
                  </Button>
                )}
                {canStartPreparing && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onPrepare?.(order.order_id)}
                  >
                    <Icon name="play" size={14} />
                    Start Preparing
                  </Button>
                )}
                {canMarkReady && (
                  <Button
                    variant="primary"
                    size="sm"
                    className={cn(allChecked && "kds-pulse-ring")}
                    disabled={!allChecked}
                    onClick={() => onMarkReady?.(order.order_id)}
                  >
                    <Icon name="check" size={14} />
                    {allChecked ? "Mark Ready" : `Check all items (${checkedCount}/${totalItems})`}
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
