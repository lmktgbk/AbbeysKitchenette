import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import gcashLogo from "@/assets/gcash-logo.png";
import mayaLogo from "@/assets/maya_logo.png";

/**
 * Tender chips — Exact first, then common bills, then Clear.
 */
const QUICK_AMOUNTS = [100, 200, 500, 1000];

const DISCOUNT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "senior", label: "Senior 20%" },
  { value: "pwd", label: "PWD 20%" },
  { value: "promo", label: "Promo" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", hint: "Bills & coins", icon: "banknote" },
  { value: "gcash", label: "GCash", hint: "E-wallet", logo: gcashLogo },
  { value: "maya", label: "Maya", hint: "E-wallet", logo: mayaLogo },
];

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function hideBrokenImage(e) {
  e.currentTarget.style.display = "none";
}

/**
 * SegButton — one option inside a segmented control.
 * Active option is unmistakable: solid primary + semibold.
 */
function SegButton({ active, onClick, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg px-2 text-xs transition-colors",
        active
          ? "bg-primary font-semibold text-primary-foreground shadow-sm"
          : "font-medium text-muted-foreground hover:bg-background hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * MethodCard — one payment method in the 3-across row.
 * Logo/icon on top, label below, check badge when selected.
 */
function MethodCard({ active, onClick, method }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative cursor-pointer rounded-lg border px-2 py-2 text-center transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/50",
      )}
    >
      {active && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon name="check" size={10} />
        </span>
      )}
      <span className="flex h-6 items-center justify-center">
        {method.logo ? (
          <img src={method.logo} alt={method.label} onError={hideBrokenImage} className="h-5 w-auto object-contain" />
        ) : (
          <Icon name={method.icon} size={18} className="text-muted-foreground" />
        )}
      </span>
      <span className={cn("mt-1 block text-xs", active ? "font-semibold" : "font-medium text-muted-foreground")}>
        {method.label}
      </span>
    </button>
  );
}

/**
 * PosPaymentModal — cashier tender screen.
 *
 * BR-01: single discount (Senior 20% / PWD 20% / manual promo % or ₱)
 * and record-only payment methods (cash / gcash / maya, no gateway).
 *
 * Layout: slim header strip. Left column holds the variable-height
 * content (order lines absorb slack via internal scroll + discount).
 * Right column holds the fixed tender flow (methods, tender, receipt,
 * actions) so both columns bottom-align in every discount state.
 * Server re-prices and re-computes everything — this modal only
 * collects intent.
 */
export default function PosPaymentModal({
  open,
  onOpenChange,
  totalAmount,
  subtotalAmount,
  orderSummary,
  onConfirm,
  isLoading,
}) {
  const subtotal = Number(subtotalAmount ?? totalAmount ?? 0);
  const summaryItems = orderSummary?.items ?? [];

  const [discountType, setDiscountType] = useState("none");
  const [promoMode, setPromoMode] = useState("percent");
  const [promoValue, setPromoValue] = useState("");
  const [discountIdNo, setDiscountIdNo] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);

  // Reset form when the modal is (re)opened — state adjustment during
  // render (React-recommended reset pattern, avoids set-state-in-effect).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDiscountType("none");
      setPromoMode("percent");
      setPromoValue("");
      setDiscountIdNo("");
      setDiscountLabel("");
      setPaymentMethod("cash");
      setReferenceNo("");
      setAmountPaid("");
    }
  }

  const { discountAmount, total } = useMemo(() => {
    if (discountType === "senior" || discountType === "pwd") {
      const amt = roundMoney((subtotal * 20) / 100);
      return { discountAmount: amt, total: roundMoney(subtotal - amt) };
    }
    if (discountType === "promo") {
      const v = Number(promoValue) || 0;
      if (promoMode === "percent") {
        const pct = Math.min(Math.max(v, 0), 100);
        const amt = roundMoney((subtotal * pct) / 100);
        return { discountAmount: amt, total: roundMoney(subtotal - amt) };
      }
      const amt = Math.min(Math.max(v, 0), subtotal);
      return { discountAmount: roundMoney(amt), total: roundMoney(subtotal - amt) };
    }
    return { discountAmount: 0, total: roundMoney(subtotal) };
  }, [subtotal, discountType, promoMode, promoValue]);

  const rawPaid = Number(amountPaid);
  const paid = paymentMethod === "cash" ? (Number.isFinite(rawPaid) ? rawPaid : 0) : total;
  const change = paymentMethod === "cash" ? Math.max(0, roundMoney(paid - total)) : 0;
  const tenderOk = amountPaid !== "" && paid >= 0 && paid >= total;

  const discountValid =
    discountType === "promo"
      ? promoValue !== "" && Number(promoValue) >= 0 && (promoMode === "amount" ? Number(promoValue) <= subtotal : Number(promoValue) <= 100)
      : true;
  const paymentValid =
    paymentMethod === "cash" ? tenderOk && total >= 0 : referenceNo.trim().length > 0;
  const isValid = discountValid && paymentValid && total >= 0;

  function handleConfirm() {
    if (!isValid) return;
    onConfirm?.({
      amount_paid: roundMoney(paid),
      change,
      discount_type: discountType,
      promo_mode: discountType === "promo" ? promoMode : undefined,
      promo_value: discountType === "promo" ? Number(promoValue) : undefined,
      discount_id_no: discountType === "senior" || discountType === "pwd" ? discountIdNo.trim() || undefined : undefined,
      discount_label: discountType === "promo" ? discountLabel.trim() || undefined : undefined,
      payment_method: paymentMethod,
      reference_no: paymentMethod === "cash" ? undefined : referenceNo.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto modal-scroll p-5">
        {/* Slim single-row header */}
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 truncate text-sm">
            <DialogTitle className="mr-2 inline text-lg">Payment</DialogTitle>
            <span className="text-xs text-muted-foreground">
              {orderSummary?.itemCount ?? 0} item{(orderSummary?.itemCount ?? 0) === 1 ? "" : "s"}
              {orderSummary?.customerName && <> · {orderSummary.customerName}</>}
              {orderSummary?.tableName && <> · Table {orderSummary.tableName}</>}
            </span>
          </div>
          <p className="shrink-0 text-right">
            <span className="mr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total due</span>
            <span className="text-2xl font-bold">₱{total.toLocaleString()}</span>
          </p>
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          {/* Left — what is being charged, hugs its content */}
          <div className="flex flex-col space-y-2.5">
            {summaryItems.length > 0 && (
              <div className="max-h-52 overflow-y-auto modal-scroll rounded-lg border border-border">
                {summaryItems.map((item, idx) => (
                  <div
                    key={`${item.variant_id ?? idx}-${idx}`}
                    className="flex items-baseline justify-between gap-2 border-b border-border/50 px-3 py-1.5 text-xs last:border-0"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {item.product_name}
                      {item.size_name && <span className="text-muted-foreground"> ({item.size_name})</span>}
                      <span className="text-muted-foreground"> ×{item.quantity}</span>
                    </span>
                    <span className="shrink-0 font-semibold">
                      ₱{(Number(item.unit_price) * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Discount</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {DISCOUNT_OPTIONS.map((opt) => (
                  <SegButton
                    key={opt.value}
                    active={discountType === opt.value}
                    onClick={() => setDiscountType(opt.value)}
                    className="h-8 whitespace-nowrap"
                  >
                    {opt.label}
                  </SegButton>
                ))}
              </div>

              {(discountType === "senior" || discountType === "pwd") && (
                <Input
                  value={discountIdNo}
                  onChange={(e) => setDiscountIdNo(e.target.value)}
                  placeholder="Senior/PWD ID number (optional, for audit)"
                  className="h-9 text-sm"
                />
              )}

              {discountType === "promo" && (
                <div className="space-y-1.5">
                  <div className="flex gap-1 rounded-lg bg-muted p-1">
                    <SegButton
                      active={promoMode === "percent"}
                      onClick={() => setPromoMode("percent")}
                      className="h-7"
                    >
                      % off
                    </SegButton>
                    <SegButton
                      active={promoMode === "amount"}
                      onClick={() => setPromoMode("amount")}
                      className="h-7"
                    >
                      ₱ off
                    </SegButton>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={promoValue}
                    onChange={(e) => setPromoValue(e.target.value)}
                    placeholder={promoMode === "percent" ? "Percent (0–100)" : "Peso amount"}
                    className="h-9 text-sm"
                  />
                  <Input
                    value={discountLabel}
                    onChange={(e) => setDiscountLabel(e.target.value)}
                    placeholder="Promo label (optional)"
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right — tender flow (fixed height, always full) */}
          <div className="flex flex-col space-y-2.5">
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <MethodCard
                  key={m.value}
                  method={m}
                  active={paymentMethod === m.value}
                  onClick={() => setPaymentMethod(m.value)}
                />
              ))}
            </div>

            {paymentMethod === "cash" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Amount received</label>
                <Input
                  type="number"
                  min="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0"
                  className="h-11 text-xl font-semibold"
                  autoFocus
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-semibold"
                    onClick={() => setAmountPaid(String(total))}
                  >
                    Exact ₱{total.toLocaleString()}
                  </Button>
                  {QUICK_AMOUNTS.map((amt) => (
                    <Button
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() => setAmountPaid(String(amt))}
                    >
                      ₱{amt.toLocaleString()}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setAmountPaid("")}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-sm font-medium">Reference number</label>
                <Input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder={`e.g. ${paymentMethod.toUpperCase()} ref no.`}
                  className="h-10 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  No gateway integration — exact total ₱{total.toLocaleString()} is recorded against this reference.
                </p>
              </div>
            )}

            {/* Receipt — tender outcome in one place */}
            <div className="space-y-1 rounded-lg bg-muted/60 px-3.5 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">₱{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  −₱{discountAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium">
                  {paymentMethod === "cash"
                    ? (amountPaid !== "" && paid >= 0 ? `₱${roundMoney(paid).toLocaleString()}` : "—")
                    : `₱${total.toLocaleString()}`}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1">
                <span className="font-semibold">Change</span>
                <span className={cn("text-base font-bold", change > 0 && "text-green-600 dark:text-green-400")}>
                  {paymentMethod === "cash"
                    ? (tenderOk ? `₱${change.toLocaleString()}` : "—")
                    : "₱0"}
                </span>
              </div>
            </div>

            {/* Actions — two real buttons, equal height */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="lg"
                className="h-12 flex-1 text-base font-semibold"
                onClick={() => onOpenChange?.(false)}
              >
                Cancel
              </Button>
              <Button
                size="lg"
                disabled={!isValid || isLoading}
                onClick={handleConfirm}
                className="h-12 flex-[2] text-base font-bold"
              >
                {isLoading ? "Processing..." : (
                  <span className="flex items-center gap-2">
                    <Icon name="check" size={18} />
                    Charge ₱{total.toLocaleString()}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
