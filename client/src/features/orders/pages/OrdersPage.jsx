import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useOrderList, useOrderDetail, useOrderMutations } from "../query";
import { useMyShifts, useShiftsList, useShiftMutations } from "@/features/shifts/query";
import ShiftBanner from "@/features/shifts/components/ShiftBanner";
import OpenShiftModal from "@/features/shifts/components/OpenShiftModal";
import CloseShiftModal from "@/features/shifts/components/CloseShiftModal";
import useAuthStore from "@/features/auth/authStore";
import { confirm, confirmWithReason } from "@/components/alerts/ConfirmDialog";
import OrderStats from "../components/OrderStats";
import OrderTable from "../components/OrderTable";
import OrderDetailModal from "../components/OrderDetailModal";
import PosPaymentModal from "../components/PosPaymentModal";
import CancelOrderDialog from "@/components/orders/CancelOrderDialog";
import RemoveItemDialog from "@/components/orders/RemoveItemDialog";
import { Pagination } from "@/components/filters/Pagination";
import { SearchBar } from "@/components/filters/SearchBar";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

const CANCEL_REASONS = [
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "wrong_order", label: "Wrong order" },
  { value: "duplicate", label: "Duplicate order" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "other", label: "Other" },
];

/**
 * OrdersPage
 *
 * Main orchestrator for order management.
 * Shows KPI stats, queue board, order table with search/filter/sort, and detail modal.
 */
export default function OrdersPage({ embedded = false }) {
  const mutations = useOrderMutations();
  const shiftMutations = useShiftMutations();
  const user = useAuthStore((s) => s.user);
  const canHandleCash = user?.role === "admin" || user?.role === "cashier";

  // ── Shifts (BR-02) ───────────────────
  const { data: shiftsData, isLoading: shiftsLoading } = useMyShifts();
  const myShifts = shiftsData?.data?.shifts ?? [];
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [closingShift, setClosingShift] = useState(null);

  // Admin: all shifts history (latest first).
  const { data: allShiftsData } = useShiftsList(
    { status: "all", limit: "10" },
    { enabled: user?.role === "admin" && !embedded },
  );
  const allShifts = allShiftsData?.data?.shifts ?? [];

  // ── Filters ────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [pageSize, setPageSize] = useState(50);

  const queryParams = useMemo(() => ({
    page: String(page),
    limit: String(pageSize),
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }), [page, search, statusFilter, dateFrom, dateTo, pageSize]);

  // ── Data ───────────────────────────
  const { data: ordersData, isLoading } = useOrderList(queryParams);
  const orders = ordersData?.data?.orders ?? [];
  const totalItems = ordersData?.data?.totalItems ?? 0;

  // ── Detail modal ───────────────────
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const { data: detailData, isLoading: isLoadingDetail } = useOrderDetail(selectedOrderId);

  const detailOrder = detailData?.data?.order ?? null;

  // ── Accept payment modal ───────────
  const [acceptingOrder, setAcceptingOrder] = useState(null);

  // ── Cancel dialog ──────────────────
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const { data: cancelDetailData, isLoading: isLoadingCancelDetail } = useOrderDetail(cancellingOrderId);
  const cancelOrder = cancelDetailData?.data?.order ?? null;

  // ── Remove item dialog ─────────────
  const [removingItem, setRemovingItem] = useState(null); // { orderId, item }

  // ── Handlers ───────────────────────

  function handleView(order) {
    setSelectedOrderId(order.order_id);
    setShowDetailModal(true);
  }

  async function handleAdvance(orderOrId, targetStatus) {
    const orderId = typeof orderOrId === "string" ? orderOrId : orderOrId.order_id;
    const currentOrder = typeof orderOrId === "string" ? null : orderOrId;

    // Compute next status if not provided
    if (!targetStatus && currentOrder) {
      const flow = ["pending", "accepted", "preparing", "completed"];
      const idx = flow.indexOf(currentOrder.status);
      targetStatus = (idx !== -1 && idx < flow.length - 1) ? flow[idx + 1] : null;
    }
    if (!targetStatus) return;

    // For pending -> accepted, need amount_paid
    const needsPayment = currentOrder?.status === "pending";

    if (needsPayment) {
      setAcceptingOrder(currentOrder);
      return;
    }

    const statusLabels = {
      accepted: "Accept",
      preparing: "Prepare",
      completed: "Complete",
    };

    const displayTarget = statusLabels[targetStatus] || targetStatus;

    const ok = await confirm({
      title: `${displayTarget} Order?`,
      message: `This will move order #${currentOrder?.order_number || ""} to "${displayTarget}" status.`,
      confirmLabel: "Confirm",
      loadingText: "Updating...",
      variant: "info",
      onConfirm: () => mutations.advanceStatus.mutateAsync({
        id: orderId,
        data: { status: targetStatus },
      }),
    });

    if (ok) toast.success("Order updated");
  }

  async function handleOpenShiftConfirm(data) {
    try {
      await shiftMutations.open.mutateAsync(data);
      toast.success("Shift opened");
      setShowOpenShift(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to open shift");
    }
  }

  async function handleCloseShiftConfirm(data) {
    if (!closingShift) return;
    const forced = user?.role === "admin" && closingShift.opened_by !== user?.id;
    try {
      const fn = forced ? shiftMutations.forceClose : shiftMutations.close;
      const res = await fn.mutateAsync({ id: closingShift.shift_id, data });
      const variance = Number(res?.data?.shift?.variance ?? 0);
      toast.success(
        variance === 0
          ? "Shift closed — balanced"
          : `Shift closed — variance ${variance > 0 ? "+" : ""}₱${variance.toLocaleString()}`,
      );
      setClosingShift(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to close shift");
    }
  }

  async function handleCancelClick(order) {
    const isPending = order.status === "pending";
    const isAccepted = order.status === "accepted";

    // Pending orders: reason required, soft-cancel (no ingredients deducted, no payment received)
    if (isPending) {
      await confirmWithReason({
        title: "Delete Order?",
        message: `Delete order #${order.order_number}? This will permanently remove the order.`,
        confirmLabel: "Delete",
        reasons: CANCEL_REASONS,
        loadingText: "Deleting...",
        onConfirm: async ({ reason, custom_reason }) => {
          await mutations.cancel.mutateAsync({
            id: order.order_id,
            data: { reason, custom_reason },
          });
          toast.success("Order deleted");
        },
      });
      return;
    }

    // Accepted orders: reason required, auto full refund + ingredient restore
    if (isAccepted) {
      const total = Number(order.total_amount).toLocaleString();
      await confirmWithReason({
        title: `Cancel Order #${order.order_number}?`,
        message: `Cancelling will restore all ingredients and issue a full refund of ₱${total}.`,
        confirmLabel: "Yes, Cancel Order",
        reasons: CANCEL_REASONS,
        loadingText: "Cancelling...",
        onConfirm: async ({ reason, custom_reason }) => {
          await mutations.cancel.mutateAsync({
            id: order.order_id,
            data: { reason, custom_reason, refund_option: "full" },
          });
          toast.success("Order cancelled");
        },
      });
      return;
    }

    // Preparing orders: open rich cancel dialog
    setCancellingOrderId(order.order_id);
  }

  async function handleCancelConfirm({ loss_option, refund_option, refund_amount, reason, custom_reason, item_losses }) {
    if (!cancellingOrderId) return;
    try {
      await mutations.cancel.mutateAsync({
        id: cancellingOrderId,
        data: { reason, custom_reason, loss_option, refund_option, refund_amount, item_losses },
      });
      toast.success("Order cancelled");
      setCancellingOrderId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel order");
    }
  }

  async function handleRemoveItemClick(order, item) {
    if (order.status === "accepted") {
      const label = item.size_name
        ? `${item.product_name} (${item.size_name})`
        : item.product_name;

      await confirmWithReason({
        title: `Remove ${label}?`,
        message: `All ingredients will be restored. Full refund of ₱${Number(item.subtotal || 0).toLocaleString()} will be issued.`,
        reasons: CANCEL_REASONS,
        confirmLabel: "Remove Item",
        cancelLabel: "Keep Item",
        loadingText: "Removing...",
        onConfirm: async ({ reason, custom_reason }) => {
          const result = await mutations.removeItem.mutateAsync({
            orderId: order.order_id,
            itemId: item.order_item_id,
            data: { reason, custom_reason, loss_option: "no_loss", refund_option: "full", ingredient_losses: [] },
          });
          const msg = result?.data?.action === "cancelled"
            ? "Order cancelled (no items left)"
            : "Item removed";
          toast.success(msg);
        },
      });
      return;
    }

    setRemovingItem({ orderId: order.order_id, orderStatus: order.status, item });
  }

  async function handleRemoveItemConfirm({ reason, custom_reason, loss_option, refund_option, refund_amount, ingredient_losses }) {
    if (!removingItem) return;
    try {
      const result = await mutations.removeItem.mutateAsync({
        orderId: removingItem.orderId,
        itemId: removingItem.item.order_item_id,
        data: { reason, custom_reason, loss_option, refund_option, refund_amount, ingredient_losses },
      });
      const msg = result?.data?.action === "cancelled"
        ? "Order cancelled (no items left)"
        : "Item removed";
      toast.success(msg);
      setRemovingItem(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove item");
    }
  }

  async function handleAcceptPaymentConfirm({ amount_paid, discount_type, promo_mode, promo_value, discount_id_no, discount_label, payment_method, reference_no }) {
    if (!acceptingOrder) return;
    try {
      await mutations.advanceStatus.mutateAsync({
        id: acceptingOrder.order_id,
        data: {
          status: "accepted",
          amount_paid,
          discount_type,
          promo_mode,
          promo_value,
          discount_id_no,
          discount_label,
          payment_method,
          reference_no,
        },
      });
      toast.success(`Order #${acceptingOrder.order_number} accepted`);
      setAcceptingOrder(null);
    } catch (err) {
      if (err.response?.data?.error === "SHIFT_REQUIRED") {
        toast.error("Open a shift before taking payments");
        setAcceptingOrder(null);
        setShowOpenShift(true);
        return;
      }
      toast.error(err.response?.data?.message || "Failed to accept order");
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${embedded ? "p-6 h-full overflow-y-auto" : ""}`}>
      {/* Shift banner (BR-02) — drawer session + reconciliation entry */}
      {canHandleCash && (
        <ShiftBanner
          shifts={myShifts}
          isLoading={shiftsLoading}
          onOpenShift={() => setShowOpenShift(true)}
          onCloseShift={setClosingShift}
        />
      )}

      {/* KPI Stats */}
      <OrderStats activeStatus={statusFilter} onStatusClick={setStatusFilter} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <SearchBar
            value={search}
            onChange={(val) => { setSearch(val); setPage(1); }}
            placeholder="Search by customer or order number..."
          />
        </div>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
            setPage(1);
          }}
        />
        {!embedded && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/kitchen", "_blank")}
            >
              <Icon name="chefHat" size={16} />
              Open Kitchen
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.open("/pos", "_blank")}
            >
              <Icon name="cart" size={16} />
              Open POS Registry
            </Button>
          </>
        )}
      </div>

      {/* Order Table + Pagination */}
      <div className="rounded-xl border border-border bg-card">
        <OrderTable
          orders={orders}
          isLoading={isLoading}
          onView={handleView}
          onAdvance={handleAdvance}
        />

        {/* Pagination */}
        <Pagination
          currentPage={page}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="orders"
        />
      </div>

      {/* Detail Modal */}
      <OrderDetailModal
        open={showDetailModal}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
          setShowDetailModal(open);
        }}
        order={detailOrder}
        loading={isLoadingDetail}
        onCancel={(order) => {
          setShowDetailModal(false);
          handleCancelClick(order);
        }}
        onAdvance={(order) => {
          setShowDetailModal(false);
          handleAdvance(order);
        }}
        onRemoveItem={handleRemoveItemClick}
      />

      {/* Shift history (BR-02, admin) — system vs actual per drawer session */}
      {user?.role === "admin" && !embedded && allShifts.length > 0 && (
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent shifts
          </p>
          <div className="space-y-1.5">
            {allShifts.map((s) => {
              const variance = s.variance != null ? Number(s.variance) : null;
              return (
                <div key={s.shift_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">{s.opener_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.opened_at ? new Date(s.opened_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.status === "open" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {s.status === "open" ? "Open" : "Closed"}
                  </span>
                  <span className="ml-auto tabular-nums">
                    {s.status === "open" ? (
                      <span className="text-muted-foreground">drawer open</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground">sys ₱{Number(s.expected_cash ?? 0).toLocaleString()} · </span>
                        <span>act ₱{Number(s.actual_cash ?? 0).toLocaleString()} · </span>
                        <span className={variance === 0 ? "font-semibold text-green-600 dark:text-green-400" : "font-semibold text-destructive"}>
                          {variance > 0 ? "+" : ""}₱{(variance ?? 0).toLocaleString()}
                        </span>
                      </>
                    )}
                  </span>
                  {s.status === "open" && (
                    <Button variant="outline" size="sm" onClick={() => setClosingShift(s)}>
                      {s.opened_by === user?.id ? "Close" : "Force-close"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Accept Payment Modal */}
      <PosPaymentModal
        open={!!acceptingOrder}
        onOpenChange={(open) => { if (!open) setAcceptingOrder(null); }}
        totalAmount={acceptingOrder ? Number(acceptingOrder.total_amount) : 0}
        onConfirm={handleAcceptPaymentConfirm}
        isLoading={mutations.advanceStatus.isPending}
      />

      {/* Shift modals (BR-02) */}
      <OpenShiftModal
        open={showOpenShift}
        onOpenChange={setShowOpenShift}
        onConfirm={handleOpenShiftConfirm}
        isLoading={shiftMutations.open.isPending}
      />
      <CloseShiftModal
        open={!!closingShift}
        onOpenChange={(open) => { if (!open) setClosingShift(null); }}
        shift={closingShift}
        forced={user?.role === "admin" && !!closingShift && closingShift.opened_by !== user?.id}
        onConfirm={handleCloseShiftConfirm}
        isLoading={shiftMutations.close.isPending || shiftMutations.forceClose.isPending}
      />

      {/* Cancel Order Dialog */}
      <CancelOrderDialog
        open={!!cancellingOrderId}
        onOpenChange={(open) => { if (!open) setCancellingOrderId(null); }}
        order={cancelOrder}
        loading={isLoadingCancelDetail || mutations.cancel.isPending}
        onConfirm={handleCancelConfirm}
      />

      {/* Remove Item Dialog */}
      <RemoveItemDialog
        open={!!removingItem}
        onOpenChange={(open) => { if (!open) setRemovingItem(null); }}
        item={removingItem?.item ?? null}
        orderStatus={removingItem?.orderStatus}
        loading={mutations.removeItem.isPending}
        onConfirm={handleRemoveItemConfirm}
      />
    </div>
  );
}
