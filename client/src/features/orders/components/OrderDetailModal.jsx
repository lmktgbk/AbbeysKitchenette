import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import OrderTimeline from "./OrderTimeline";
import { formatDate } from "@/lib/date";

const STATUS_CONFIG = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "info" },
  next_in_line: { label: "Next in Line", variant: "purple" },
  processing: { label: "Processing", variant: "orange" },
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
 */
export default function OrderDetailModal({
  open,
  onOpenChange,
  order,
  loading,
  onAdvance,
  onCancel,
  showActions = true,
}) {
  if (!order && !loading) return null;

  const status = STATUS_CONFIG[order?.status] || STATUS_CONFIG.pending;
  const isTerminal = order?.status === "completed" || order?.status === "cancelled";
  const canAdvance = order?.status !== "completed" && order?.status !== "cancelled";
  const canCancel = order?.status === "pending" || order?.status === "accepted" || order?.status === "next_in_line";

  const total = order?.items?.reduce((sum, item) => sum + Number(item.subtotal || 0), 0) || 0;

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
            {/* Side-by-side: Left = info + items, Right = timeline */}
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
                  {order?.processing_by && (
                    <InfoRow label="Processing by" value={formatActor(order?.processing_by)} />
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
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Items</p>
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-center w-16">Qty</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {order?.items?.map((item) => (
                          <TableRow key={item.order_item_id}>
                            <TableCell className="font-medium">
                              {item.product_name || "—"}
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({item.size_name || "—"})
                              </span>
                            </TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              ₱{Number(item.unit_price).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ₱{Number(item.subtotal).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={3} className="text-right font-medium text-muted-foreground">
                            Total
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            ₱{total.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
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
            {showActions && !isTerminal && (
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
                {canAdvance && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onAdvance?.(order)}
                  >
                    Advance Status
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
