import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
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

// Static lookup — Tailwind can't compile dynamic grid-cols-${n}.
const GRID_COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

const DISCOUNT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "senior", label: "Senior 20%" },
  { value: "pwd", label: "PWD 20%" },
  { value: "promo", label: "Promo" },
];

// Per-item picker — compact labels to fit inside each order-line card.
const ITEM_DISCOUNT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "senior", label: "SNR 20%" },
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

function blankLineState() {
  return { type: "none", promoMode: "percent", promoValue: "", promoLabel: "" };
}

function lineSubtotalOf(item) {
  return roundMoney(Number(item.unit_price) * item.quantity);
}

function lineDiscountOf(lineSubtotal, line) {
  if (line.type === "senior" || line.type === "pwd") {
    const amt = roundMoney((lineSubtotal * 20) / 100);
    return { amount: amt, percent: 20 };
  }
  if (line.type === "promo") {
    const v = Number(line.promoValue) || 0;
    if (line.promoMode === "percent") {
      const pct = Math.min(Math.max(v, 0), 100);
      return { amount: roundMoney((lineSubtotal * pct) / 100), percent: pct };
    }
    return { amount: Math.min(Math.max(v, 0), lineSubtotal), percent: 0 };
  }
  return { amount: 0, percent: 0 };
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
 * Per-item discounts: each order line carries at most ONE discount
 * (None / Senior 20% / PWD 20% / manual Promo % or ₱). Different lines may
 * carry different types (e.g. pwd lines + regular lines in one order), but a
 * line that already has one discount locks out the other two for that line.
 * Senior/PWD are fixed 20% of their own line; promo is manual per line.
 * Order total = Σ net lines. Server re-prices and re-computes everything —
 * this modal only collects intent.
 */
export default function PosPaymentModal({
  open,
  onOpenChange,
  totalAmount,
  subtotalAmount,
  orderSummary,
  onConfirm,
  isLoading,
  // Accepted methods from Settings (public store settings). Defaults to all.
  acceptedPayments,
}) {
  const subtotal = Number(subtotalAmount ?? totalAmount ?? 0);
  const summaryItems = useMemo(() => orderSummary?.items ?? [], [orderSummary]);
  const hasLines = summaryItems.length > 0;

  // ── Per-item discount state (primary when order lines are present) ──
  const [lineDiscounts, setLineDiscounts] = useState([]);
  // Accordion: which line's picker is open (null = all collapsed, the tidy default).
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [seniorIdNo, setSeniorIdNo] = useState("");
  const [pwdIdNo, setPwdIdNo] = useState("");

  // ── Legacy whole-order discount state (fallback when no lines) ──
  const [discountType, setDiscountType] = useState("none");
  const [promoMode, setPromoMode] = useState("percent");
  const [promoValue, setPromoValue] = useState("");
  const [discountIdNo, setDiscountIdNo] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  const [prevOpen, setPrevOpen] = useState(open);

  // Methods enabled in Settings; server re-validates on submit regardless.
  const visibleMethods = useMemo(() => {
    if (!Array.isArray(acceptedPayments) || acceptedPayments.length === 0) return PAYMENT_METHODS;
    return PAYMENT_METHODS.filter((m) => acceptedPayments.includes(m.value));
  }, [acceptedPayments]);

  // Reset form when the modal is (re)opened — state adjustment during
  // render (React-recommended reset pattern, avoids set-state-in-effect).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setLineDiscounts(summaryItems.map(() => blankLineState()));
      setExpandedIdx(null);
      setSeniorIdNo("");
      setPwdIdNo("");
      setDiscountType("none");
      setPromoMode("percent");
      setPromoValue("");
      setDiscountIdNo("");
      setDiscountLabel("");
      setPaymentMethod((prev) =>
        visibleMethods.some((m) => m.value === prev) ? prev : (visibleMethods[0]?.value ?? "cash"),
      );
      setReferenceNo("");
      setAmountPaid("");
    }
  }

  // Accepted list may arrive after open (settings fetch) — coerce if needed.
  if (open && !visibleMethods.some((m) => m.value === paymentMethod)) {
    setPaymentMethod(visibleMethods[0]?.value ?? "cash");
  }

  // Keep per-line state aligned if the cart changes while open.
  if (open && hasLines && lineDiscounts.length !== summaryItems.length) {
    setLineDiscounts((prev) =>
      summaryItems.map((_, i) => prev[i] ?? blankLineState()),
    );
  }
  if (open && expandedIdx != null && expandedIdx >= summaryItems.length) {
    setExpandedIdx(null);
  }

  function setLineField(idx, patch) {
    setLineDiscounts((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  // ── Totals: per-item mode sums net lines; legacy mode discounts the bill ──
  const perLine = useMemo(() => {
    if (!hasLines) return [];
    return summaryItems.map((item, idx) => {
      const base = lineSubtotalOf(item);
      const line = lineDiscounts[idx] ?? blankLineState();
      const d = lineDiscountOf(base, line);
      return { base, amount: d.amount, percent: d.percent, net: roundMoney(base - d.amount) };
    });
  }, [hasLines, summaryItems, lineDiscounts]);

  const legacy = useMemo(() => {
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

  const discountAmount = hasLines
    ? roundMoney(perLine.reduce((s, l) => s + l.amount, 0))
    : legacy.discountAmount;
  const total = hasLines
    ? roundMoney(perLine.reduce((s, l) => s + l.net, 0))
    : legacy.total;
  const usesSenior = hasLines
    ? (lineDiscounts.some((l) => l?.type === "senior"))
    : discountType === "senior";
  const usesPwd = hasLines
    ? (lineDiscounts.some((l) => l?.type === "pwd"))
    : discountType === "pwd";

  const rawPaid = Number(amountPaid);
  const paid = paymentMethod === "cash" ? (Number.isFinite(rawPaid) ? rawPaid : 0) : total;
  const change = paymentMethod === "cash" ? Math.max(0, roundMoney(paid - total)) : 0;
  const tenderOk = amountPaid !== "" && paid >= 0 && paid >= total;

  const perItemValid = hasLines
    ? perLine.every((l, idx) => {
        const line = lineDiscounts[idx] ?? blankLineState();
        if (line.type !== "promo") return true;
        if (line.promoValue === "" || Number(line.promoValue) < 0) return false;
        return line.promoMode === "percent"
          ? Number(line.promoValue) <= 100
          : Number(line.promoValue) <= l.base;
      }) &&
      (!usesSenior || seniorIdNo.trim().length > 0) &&
      (!usesPwd || pwdIdNo.trim().length > 0)
    : true;

  const discountValid = hasLines
    ? perItemValid
    : discountType === "promo"
      ? promoValue !== "" && Number(promoValue) >= 0 && (promoMode === "amount" ? Number(promoValue) <= subtotal : Number(promoValue) <= 100)
      : true;
  const paymentValid =
    paymentMethod === "cash" ? tenderOk && total >= 0 : referenceNo.trim().length > 0;
  const isValid = discountValid && paymentValid && total >= 0;

  function handleConfirm() {
    if (!isValid) return;
    if (hasLines) {
      // Per-item payload: one discount per line + audit IDs. Legacy
      // whole-order fields stay "none" so old servers/clients ignore them.
      const itemDiscounts = summaryItems.map((item, idx) => {
        const line = lineDiscounts[idx] ?? blankLineState();
        const patch = { discount_type: line.type };
        if (item.order_item_id != null) patch.order_item_id = item.order_item_id;
        if (line.type === "promo") {
          patch.promo_mode = line.promoMode;
          patch.promo_value = Number(line.promoValue);
          if (line.promoLabel.trim()) patch.discount_label = line.promoLabel.trim();
        }
        return patch;
      });
      onConfirm?.({
        amount_paid: roundMoney(paid),
        change,
        discount_type: "none",
        senior_id_no: seniorIdNo.trim() || undefined,
        pwd_id_no: pwdIdNo.trim() || undefined,
        discount_id_no: seniorIdNo.trim() || pwdIdNo.trim() || undefined,
        item_discounts: itemDiscounts,
        payment_method: paymentMethod,
        reference_no: paymentMethod === "cash" ? undefined : referenceNo.trim(),
      });
      return;
    }
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
        <DialogClose onClick={() => onOpenChange?.(false)} />
        {/* Slim single-row header */}
        <div className="mb-3 pr-12">
          <div className="min-w-0 truncate text-sm">
            <DialogTitle className="mr-2 inline text-lg">Payment</DialogTitle>
            <span className="text-xs text-muted-foreground">
              {orderSummary?.itemCount ?? 0} item{(orderSummary?.itemCount ?? 0) === 1 ? "" : "s"}
              {orderSummary?.customerName && <> · {orderSummary.customerName}</>}
              {orderSummary?.tableName && <> · Table {orderSummary.tableName}</>}
            </span>
          </div>
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          {/* Left — what is being charged, hugs its content */}
          <div className="flex flex-col space-y-2.5">
            {hasLines ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Items & discounts</label>
                <p className="text-xs text-muted-foreground">
                  Tap a line to add its discount — one per item.
                </p>
                <div className="max-h-64 overflow-y-auto modal-scroll rounded-lg border border-border">
                  {summaryItems.map((item, idx) => {
                    const line = lineDiscounts[idx] ?? blankLineState();
                    const calc = perLine[idx] ?? { base: lineSubtotalOf(item), amount: 0, net: lineSubtotalOf(item) };
                    const expanded = expandedIdx === idx;
                    const badge =
                      line.type === "senior" ? "SNR 20%" : line.type === "pwd" ? "PWD 20%" : line.type === "promo" ? "Promo" : null;
                    return (
                      <div
                        key={`${item.order_item_id ?? item.variant_id ?? idx}-${idx}`}
                        className="border-b border-border/50 px-3 py-2 last:border-0"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-medium">
                            {item.product_name}
                            {item.size_name && <span className="text-muted-foreground"> ({item.size_name})</span>}
                            <span className="text-muted-foreground"> ×{item.quantity}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 font-semibold">
                            {!expanded && badge && (
                              <span className="rounded-full bg-green-600/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">
                                {badge} −₱{calc.amount.toLocaleString()}
                              </span>
                            )}
                            <span>
                              ₱{calc.base.toLocaleString()}
                              {(expanded || !badge) && calc.amount > 0 && (
                                <span className="ml-1 font-medium text-green-600 dark:text-green-400">
                                  −₱{calc.amount.toLocaleString()}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={expanded ? `Hide discount options for ${item.product_name}` : `Add discount for ${item.product_name}`}
                              onClick={() => setExpandedIdx(expanded ? null : idx)}
                              className={cn(
                                "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                expanded && "bg-muted text-foreground",
                              )}
                            >
                              <Icon name="chevronDown" size={14} className={cn("transition-transform", expanded && "rotate-180")} />
                            </button>
                          </span>
                        </div>
                        {expanded && (
                          <>
                        <div className="mt-1.5 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                          {ITEM_DISCOUNT_OPTIONS.map((opt) => (
                            <SegButton
                              key={opt.value}
                              active={line.type === opt.value}
                              onClick={() => {
                                setLineField(idx, { type: opt.value });
                                if (opt.value === "none") setExpandedIdx(null);
                              }}
                              className="h-7 whitespace-nowrap px-1 text-[11px]"
                            >
                              {opt.label}
                            </SegButton>
                          ))}
                        </div>
                        {line.type === "senior" || line.type === "pwd" ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {line.type === "senior" ? "Senior" : "PWD"} 20% on this item only — locked for this line.
                          </p>
                        ) : null}
                        {line.type === "promo" && (
                          <div className="mt-1.5 space-y-1.5">
                            <div className="flex gap-1 rounded-lg bg-muted p-1">
                              <SegButton
                                active={line.promoMode === "percent"}
                                onClick={() => setLineField(idx, { promoMode: "percent" })}
                                className="h-6 text-[11px]"
                              >
                                % off
                              </SegButton>
                              <SegButton
                                active={line.promoMode === "amount"}
                                onClick={() => setLineField(idx, { promoMode: "amount" })}
                                className="h-6 text-[11px]"
                              >
                                ₱ off
                              </SegButton>
                            </div>
                            <Input
                              type="number"
                              min="0"
                              value={line.promoValue}
                              onChange={(e) => setLineField(idx, { promoValue: e.target.value })}
                              placeholder={line.promoMode === "percent" ? "Percent (0–100)" : `Peso amount (max ₱${calc.base.toLocaleString()})`}
                              className="h-8 text-xs"
                            />
                            <Input
                              value={line.promoLabel}
                              onChange={(e) => setLineField(idx, { promoLabel: e.target.value })}
                              placeholder="Promo label (optional)"
                              className="h-8 text-xs"
                            />
                          </div>
                        )}
                        </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(usesSenior || usesPwd) && (
                  <div className="space-y-1.5">
                    {usesSenior && (
                      <Input
                        value={seniorIdNo}
                        onChange={(e) => setSeniorIdNo(e.target.value)}
                        placeholder="Senior ID number (required for audit)"
                        className="h-9 text-sm"
                      />
                    )}
                    {usesPwd && (
                      <Input
                        value={pwdIdNo}
                        onChange={(e) => setPwdIdNo(e.target.value)}
                        placeholder="PWD ID number (required for audit)"
                        className="h-9 text-sm"
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
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
                {/* PH rule: Senior/PWD 20% can't combine with promos — show best value */}
                {(() => {
                  const seniorAmt = roundMoney((subtotal * 20) / 100);
                  if (discountType === "promo" && promoValue !== "" && Number(promoValue) >= 0) {
                    const better = seniorAmt > discountAmount ? "senior" : "promo";
                    return (
                      <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                        Senior/PWD 20% saves ₱{seniorAmt.toLocaleString()} vs promo ₱{discountAmount.toLocaleString()} — only one can apply{better === "senior" ? ", Senior/PWD wins" : ", promo wins"}.
                        {better === "senior" && (
                          <button
                            type="button"
                            onClick={() => setDiscountType("senior")}
                            className="ml-1 font-medium text-primary hover:underline"
                          >
                            Use Senior/PWD instead
                          </button>
                        )}
                      </div>
                    );
                  }
                  if (discountType === "senior" || discountType === "pwd") {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Saves ₱{seniorAmt.toLocaleString()} (statutory 20% — can't combine with promos).
                      </p>
                    );
                  }
                  return null;
                })()}

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
            )}
          </div>

          {/* Right — tender flow (fixed height, always full) */}
          <div className="flex flex-col space-y-2.5">
            <div className={cn("grid gap-1.5", GRID_COLS[visibleMethods.length] ?? "grid-cols-3")}>
              {visibleMethods.map((m) => (
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
              <div className="flex items-center justify-between border-t border-border pt-1">
                <span className="font-semibold">Total</span>
                <span className="text-base font-bold">₱{total.toLocaleString()}</span>
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
