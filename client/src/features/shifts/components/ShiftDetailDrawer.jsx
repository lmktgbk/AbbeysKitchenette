import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { FilterPill } from "@/components/filters/FilterPill";
import { Pagination } from "@/components/filters/Pagination";
import { useShiftSummary, useShiftOrders, useShiftIngredientUsage } from "../query";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/money";
import { orderNumberLabel } from "@/lib/orderNumber";
import VariancePill from "./VariancePill";
import { initials, humanDay, timeHM, formatDuration } from "../shiftUtils";

const ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ORDERS_PAGE_SIZE = 15;

const STATUS_DOTS = {
  completed: "bg-green-500",
  cancelled: "bg-destructive",
  preparing: "bg-amber-500",
  accepted: "bg-blue-500",
  pending: "bg-muted-foreground/40",
};

function FlowRow({ symbol, label, value, bold, tone }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="w-4 shrink-0 text-center font-bold text-muted-foreground">{symbol}</span>
      <span className={cn("flex-1 text-muted-foreground", bold && "font-semibold text-foreground")}>{label}</span>
      <span className={cn("font-medium tabular-nums", bold && "text-base font-bold", tone)}>{value}</span>
    </div>
  );
}

/**
 * ShiftDetailDrawer (BR-02)
 *
 * One shift as a Z-reading: verdict hero first, then the money flow
 * that produced it, non-cash aside, kitchen warning, and the orders.
 */
export default function ShiftDetailDrawer({ open, onOpenChange, shiftId, onCloseShift }) {
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersStatus, setOrdersStatus] = useState("all");
  const [prevShiftId, setPrevShiftId] = useState(shiftId);

  // Reset paging whenever a different shift is opened.
  if (shiftId !== prevShiftId) {
    setPrevShiftId(shiftId);
    setOrdersPage(1);
    setOrdersStatus("all");
  }
  const { data: summaryData, isLoading: loadingSummary } = useShiftSummary(open ? shiftId : null);
  const { data: ordersData, isLoading: loadingOrders } = useShiftOrders(
    open ? shiftId : null,
    { page: String(ordersPage), limit: String(ORDERS_PAGE_SIZE), status: ordersStatus },
  );

  const { data: usageData, isLoading: loadingUsage } = useShiftIngredientUsage(open ? shiftId : null);

  const shift = summaryData?.data?.shift ?? null;
  const summary = summaryData?.data?.summary ?? null;
  const orders = ordersData?.data?.orders ?? [];
  const totalOrders = ordersData?.data?.totalOrders ?? 0;
  
  const cashierIngredients = usageData?.data?.cashierIngredients ?? [];
  const kitchenIngredients = usageData?.data?.kitchenIngredients ?? [];
  const loading = loadingSummary || loadingOrders || loadingUsage;

  const isOpen = shift?.status === "open";
  const variance = summary?.variance != null ? Number(summary.variance) : null;
  const duration = shift ? formatDuration(shift.opened_at, shift.closed_at) : null;
  const day = shift ? humanDay(shift.opened_at) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto modal-scroll p-5">
        <DialogClose onClick={() => onOpenChange?.(false)} aria-label="Close" />
        <DialogHeader className="mb-1">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
              {initials(shift?.opener_name)}
            </span>
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                {shift?.opener_name ?? "Shift"}
                {shift && (
                  <Badge variant={isOpen ? "success" : "default"}>
                    {isOpen ? "Open" : "Closed"}
                  </Badge>
                )}
              </DialogTitle>
              {shift && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {day}
                  {shift.opened_at && <> · {timeHM(shift.opened_at)}</>}
                  {shift.closed_at && <> → {timeHM(shift.closed_at)}</>}
                  {duration && <> · {duration}</>}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {loading || !summary ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Verdict hero */}
            {isOpen ? (
              <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-green-600 dark:text-green-400">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  Live drawer
                </span>
                <span className="text-xl font-bold tabular-nums">
                  {formatPeso(summary.expected_cash)}
                </span>
              </div>
            ) : (
              <div className={cn(
                "flex items-center justify-between rounded-lg border px-4 py-2.5",
                variance === 0
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-destructive/30 bg-destructive/5",
              )}>
                <span className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-bold",
                  variance === 0 ? "text-green-600 dark:text-green-400" : "text-destructive",
                )}>
                  <Icon name={variance === 0 ? "check" : "alertTriangle"} size={16} />
                  {variance === 0 ? "Exact" : variance < 0 ? "Short" : "Over"}
                </span>
                <span className={cn(
                  "text-xl font-bold tabular-nums",
                  variance === 0
                    ? "text-green-600 dark:text-green-400"
                    : variance < 0
                      ? "text-destructive"
                      : "text-amber-700 dark:text-amber-400",
                )}>
                  {variance === 0 ? formatPeso(summary.expected_cash) : <VariancePill variance={variance} className="text-sm" />}
                </span>
              </div>
            )}

            {/* Money flow */}
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
              <FlowRow symbol="" label="Opening cash" value={formatPeso(summary.opening_cash)} />
              <FlowRow symbol="+" label={`Cash sales (${summary.cash_orders ?? 0})`} value={formatPeso(summary.cash_sales)} />
              <FlowRow symbol="−" label={`Cash refunds (${summary.refund_count ?? 0})`} value={formatPeso(summary.cash_refunds)} />
              <div className="border-t border-border pt-1.5">
                <FlowRow symbol="=" label="Expected" value={formatPeso(summary.expected_cash)} bold />
              </div>
              {summary.actual_cash != null && (
                <FlowRow label="Counted" value={formatPeso(summary.actual_cash)} />
              )}
            </div>

            {/* Non-cash aside — refunds follow their channel, never the drawer */}
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>Touched no drawer — GCash {formatPeso(summary.gcash_sales)} · Maya {formatPeso(summary.maya_sales)}</p>
              {((summary.gcash_refunds ?? 0) > 0 || (summary.maya_refunds ?? 0) > 0) && (
                <p>
                  E-wallet refunds — GCash {formatPeso(summary.gcash_refunds ?? 0)}{(summary.gcash_refund_count ?? 0) > 0 ? ` (${summary.gcash_refund_count})` : ""} · Maya {formatPeso(summary.maya_refunds ?? 0)}{(summary.maya_refund_count ?? 0) > 0 ? ` (${summary.maya_refund_count})` : ""} (netted per channel, not drawer)
                </p>
              )}
            </div>

            {(summary.open_orders ?? 0) > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {summary.open_orders} order{summary.open_orders === 1 ? "" : "s"} still in the kitchen
                ({formatPeso(summary.open_orders_total)} already counted as drawer cash).
              </p>
            )}

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Orders ({totalOrders})
                </p>
                <div className="max-w-full overflow-x-auto">
                  <FilterPill
                    options={ORDER_STATUS_OPTIONS}
                    value={ordersStatus}
                    onChange={(v) => { setOrdersStatus(v); setOrdersPage(1); }}
                  />
                </div>
              </div>
              {orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {loadingOrders ? "Loading orders..." : "No orders match this filter."}
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  {orders.map((o) => (
                    <div key={o.order_id} className="border-b border-border/50 px-3 py-2 text-xs last:border-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOTS[o.status] ?? "bg-muted-foreground/40")} />
                          <span className="truncate">{orderNumberLabel(o.order_number)} · {o.customer_name}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {formatPeso(o.total_amount)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-muted-foreground">
                        {o.items.map((i) => `${i.product_name}${i.size_name ? ` (${i.size_name})` : ""} ×${i.quantity}`).join(", ") || "—"}
                      </p>
                      <p className="mt-0.5 capitalize text-muted-foreground">
                        {o.payment_method || "cash"} · {o.status}
                      </p>
                    </div>
                  ))}
                  {totalOrders > ORDERS_PAGE_SIZE && (
                    <Pagination
                      currentPage={ordersPage}
                      totalItems={totalOrders}
                      pageSize={ORDERS_PAGE_SIZE}
                      onPageChange={setOrdersPage}
                      itemLabel="orders"
                      className="border-t-0"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Ingredients Used */}
            <div className="space-y-2 mt-4 pt-4 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ingredients Used
              </p>
              
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-2.5">
                  <p className="text-xs font-semibold text-foreground mb-2">Cashier Ingredients</p>
                  {cashierIngredients.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No beverage ingredients recorded.</p>
                  ) : (
                    <div className="space-y-1">
                      {cashierIngredients.map((ing) => (
                        <div key={ing.name} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{ing.name}</span>
                          <span className="font-medium">{ing.total} {ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-muted/40 px-4 py-2.5">
                  <p className="text-xs font-semibold text-foreground mb-2">Kitchen Ingredients</p>
                  {kitchenIngredients.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No food ingredients recorded.</p>
                  ) : (
                    <div className="space-y-1">
                      {kitchenIngredients.map((ing) => (
                        <div key={ing.name} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{ing.name}</span>
                          <span className="font-medium">{ing.total} {ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {isOpen && onCloseShift && (
              <Button variant="outline" size="sm" className="w-full font-semibold" onClick={() => onCloseShift(shift)}>
                Close this shift
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
