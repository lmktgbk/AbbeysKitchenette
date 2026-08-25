import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * OrderCancelModal
 *
 * Confirmation dialog for cancelling/deleting orders.
 * Shows different message based on order status:
 * - pending: hard delete (permanent)
 * - accepted/next_in_line: cancel + restore ingredients
 */
export default function OrderCancelModal({ open, onOpenChange, order, onConfirm, isLoading }) {
  const [reason, setReason] = useState("");

  if (!order) return null;

  const isPending = order.status === "pending";
  const title = isPending ? "Delete Order?" : "Cancel Order?";
  const message = isPending
    ? `This will permanently delete order #${order.order_number}. This cannot be undone.`
    : `This will cancel order #${order.order_number} and restore deducted ingredients.`;

  function handleConfirm() {
    onConfirm?.({ orderId: order.order_id, reason: reason || undefined });
  }

  function handleClose() {
    setReason("");
    onOpenChange?.(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>

          {!isPending && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Reason <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter cancellation reason..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Keep Order
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : isPending ? "Delete" : "Cancel Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
