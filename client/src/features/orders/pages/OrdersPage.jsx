import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useOrderList, useOrderDetail, useOrderMutations } from "../query";
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

  async function handleAcceptPaymentConfirm({ amount_paid }) {
    if (!acceptingOrder) return;
    try {
      await mutations.advanceStatus.mutateAsync({
        id: acceptingOrder.order_id,
        data: { status: "accepted", amount_paid },
      });
      toast.success(`Order #${acceptingOrder.order_number} accepted`);
      setAcceptingOrder(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to accept order");
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${embedded ? "p-6 h-full overflow-y-auto" : ""}`}>
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

      {/* Accept Payment Modal */}
      <PosPaymentModal
        open={!!acceptingOrder}
        onOpenChange={(open) => { if (!open) setAcceptingOrder(null); }}
        totalAmount={acceptingOrder ? Number(acceptingOrder.total_amount) : 0}
        onConfirm={handleAcceptPaymentConfirm}
        isLoading={mutations.advanceStatus.isPending}
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
