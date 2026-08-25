import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * QUICK_AMOUNTS — common bill denominations for quick selection.
 */
const QUICK_AMOUNTS = [100, 200, 500, 1000];

/**
 * PosPaymentModal
 *
 * Payment dialog shown when placing a walk-in order.
 * Shows total, amount paid input, change calculation, and quick amount buttons.
 */
export default function PosPaymentModal({ open, onOpenChange, totalAmount, onConfirm, isLoading }) {
  const [amountPaid, setAmountPaid] = useState("");

  useEffect(() => {
    if (open) {
      setAmountPaid("");
    }
  }, [open]);

  const paid = Number(amountPaid) || 0;
  const change = Math.max(0, paid - totalAmount);
  const isValid = paid >= totalAmount;

  function handleConfirm() {
    if (isValid) {
      onConfirm?.({ amount_paid: paid, change });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Total */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="text-2xl font-bold">₱{totalAmount.toLocaleString()}</span>
          </div>

          {/* Amount Paid */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Amount Paid</label>
            <Input
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="Enter amount"
              className="h-12 text-lg"
              autoFocus
            />
          </div>

          {/* Quick Amounts */}
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <Button
                key={amt}
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setAmountPaid(String(amt))}
              >
                ₱{amt.toLocaleString()}
              </Button>
            ))}
          </div>

          {/* Change */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">Change</span>
            <span className={`text-lg font-bold ${change > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
              {isValid ? `₱${change.toLocaleString()}` : "—"}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!isValid || isLoading}
            onClick={handleConfirm}
          >
            {isLoading ? "Processing..." : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
