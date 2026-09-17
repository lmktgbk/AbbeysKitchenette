import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = [100, 200, 500, 1000];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", icon: "banknote" },
  { value: "gcash", label: "GCash", icon: "smartphone" },
  { value: "maya", label: "Maya", icon: "smartphone" },
  { value: "card", label: "Card", icon: "credit-card" },
];

const DISCOUNT_TYPES = [
  { value: "senior", label: "Senior", percent: 20, vatExempt: true },
  { value: "pwd", label: "PWD", percent: 20, vatExempt: true },
  { value: "promotional", label: "Promo", percent: 0, vatExempt: false },
  { value: "employee", label: "Employee (10%)", percent: 10, vatExempt: false },
];

export default function PosPaymentModal({ open, onOpenChange, totalAmount, onConfirm, isLoading }) {
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentRef, setPaymentRef] = useState("");
  const [appliedDiscounts, setAppliedDiscounts] = useState([]);
  const [promoAmount, setPromoAmount] = useState("");
  const [showPromoInput, setShowPromoInput] = useState(false);

  useEffect(() => {
    if (open) {
      setAmountPaid("");
      setPaymentMethod("cash");
      setPaymentRef("");
      setAppliedDiscounts([]);
      setPromoAmount("");
      setShowPromoInput(false);
    }
  }, [open]);

  const totalDiscount = appliedDiscounts.reduce((sum, d) => sum + d.amount, 0);
  const netAmount = Math.max(0, totalAmount - totalDiscount);
  const paid = Number(amountPaid) || 0;
  const change = Math.max(0, paid - netAmount);
  const isValid = paid >= netAmount && paid > 0;

  function handleAddDiscount(type) {
    const dt = DISCOUNT_TYPES.find((d) => d.value === type);
    if (!dt || appliedDiscounts.some((d) => d.type === type)) return;

    if (dt.percent > 0) {
      const amount = totalAmount * (dt.percent / 100);
      setAppliedDiscounts((prev) => [
        ...prev,
        { type: dt.value, label: dt.label, amount, vatExempt: dt.vatExempt },
      ]);
    } else {
      setShowPromoInput(true);
    }
  }

  function handleConfirmPromo() {
    const amount = Number(promoAmount) || 0;
    if (amount <= 0) return;
    setAppliedDiscounts((prev) => [
      ...prev,
      { type: "promotional", label: "Promo", amount, vatExempt: false },
    ]);
    setPromoAmount("");
    setShowPromoInput(false);
  }

  function handleRemoveDiscount(type) {
    setAppliedDiscounts((prev) => prev.filter((d) => d.type !== type));
    if (type === "promotional") {
      setShowPromoInput(false);
      setPromoAmount("");
    }
  }

  function handleConfirm() {
    if (!isValid) return;
    onConfirm?.({
      amount_paid: paid,
      change,
      payment_method: paymentMethod,
      payment_ref: paymentRef || undefined,
      discounts: appliedDiscounts.map((d) => ({
        type: d.type,
        amount: d.amount,
        reason: d.vatExempt ? "VAT exempt + 20% discount" : undefined,
      })),
    });
  }

  const availableDiscounts = DISCOUNT_TYPES.filter(
    (dt) => !appliedDiscounts.some((d) => d.type === dt.value)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-5 gap-4">
          {/* ── Left Column: Inputs (3 cols) ── */}
          <div className="col-span-3 space-y-4">
            {/* Discounts */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Discounts</label>

              {appliedDiscounts.length > 0 && (
                <div className="space-y-1">
                  {appliedDiscounts.map((d) => (
                    <div key={d.type} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5">
                      <span className="text-xs font-medium">{d.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-600 dark:text-green-400">-₱{d.amount.toLocaleString()}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDiscount(d.type)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showPromoInput ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={promoAmount}
                    onChange={(e) => setPromoAmount(e.target.value)}
                    placeholder="Enter amount"
                    min="0"
                    className="h-8 text-xs flex-1"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleConfirmPromo(); }}
                  />
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleConfirmPromo}>
                    Apply
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowPromoInput(false); setPromoAmount(""); }}>
                    <Icon name="x" size={12} />
                  </Button>
                </div>
              ) : availableDiscounts.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {availableDiscounts.map((dt) => (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => handleAddDiscount(dt.value)}
                      className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Method</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => { setPaymentMethod(pm.value); setPaymentRef(""); }}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors",
                      paymentMethod === pm.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <Icon name={pm.icon} size={14} />
                    <span>{pm.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference Number (non-cash) */}
            {paymentMethod !== "cash" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reference Number</label>
                <Input
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder={`Enter ${paymentMethod.toUpperCase()} reference number`}
                  className="h-9 text-sm"
                />
              </div>
            )}

            {/* Amount Tendered */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {paymentMethod === "cash" ? "Cash Tendered" : "Amount"}
              </label>
              <Input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="0"
                min="0"
                className="h-11 text-lg font-semibold"
                autoFocus
              />
            </div>

            {/* Quick Amounts (cash only) */}
            {paymentMethod === "cash" && (
              <div className="flex gap-1.5">
                {QUICK_AMOUNTS.map((amt) => (
                  <Button
                    key={amt}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setAmountPaid(String(amt))}
                  >
                    ₱{amt.toLocaleString()}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* ── Right Column: Summary (2 cols, sticky) ── */}
          <div className="col-span-2">
            <div className="sticky top-0 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              {/* Total */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-sm font-bold">₱{totalAmount.toLocaleString()}</span>
              </div>

              {/* Discounts breakdown */}
              {totalDiscount > 0 && (
                <>
                  <div className="border-t border-border/60" />
                  {appliedDiscounts.map((d) => (
                    <div key={d.type} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{d.label}</span>
                      <span className="text-xs text-green-600 dark:text-green-400">-₱{d.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-xs text-muted-foreground">Net Amount</span>
                    <span className="text-sm">₱{netAmount.toLocaleString()}</span>
                  </div>
                </>
              )}

              {/* Divider */}
              <div className="border-t border-border/60" />

              {/* Change — always visible */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Change</span>
                <span className={cn(
                  "text-lg font-bold",
                  isValid ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
                )}>
                  {isValid ? `₱${change.toLocaleString()}` : "—"}
                </span>
              </div>
            </div>
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
