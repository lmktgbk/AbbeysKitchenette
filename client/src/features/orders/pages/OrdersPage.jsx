import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useOrderList, useOrderDetail, useOrderMutations } from "../query";
import { confirm, confirmWithReason } from "@/components/alerts/ConfirmDialog";
import OrderStats from "../components/OrderStats";
import OrderTable from "../components/OrderTable";
import OrderDetailModal from "../components/OrderDetailModal";
import PosPaymentModal from "../components/PosPaymentModal";
import { Pagination } from "@/components/filters/Pagination";
import { SearchBar } from "@/components/filters/SearchBar";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

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
      const flow = ["pending", "accepted", "next_in_line", "processing", "completed"];
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
      next_in_line: "Queue",
      processing: "Start Processing",
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
    const { confirmed, reason } = await confirmWithReason({
      title: isPending ? "Delete Order?" : "Cancel Order?",
      message: isPending
        ? `This will permanently delete order #${order.order_number}. This cannot be undone.`
        : `This will cancel order #${order.order_number} and restore deducted ingredients.`,
      confirmLabel: isPending ? "Delete" : "Cancel Order",
    });
    if (!confirmed) return;

    try {
      await mutations.cancel.mutateAsync({ id: order.order_id, data: { reason } });
      toast.success(isPending ? "Order deleted" : "Order cancelled");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel order");
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
              variant="primary"
              size="sm"
              onClick={() => window.open("/pos", "_blank")}
            >
              <Icon name="cart" size={16} />
              Open POS Registry
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/kitchen", "_blank")}
            >
              <Icon name="chefHat" size={16} />
              Open Kitchen
            </Button>
          </>
        )}
      </div>

      {/* Order Table */}
      <OrderTable
        orders={orders}
        isLoading={isLoading}
        onView={handleView}
        onAdvance={handleAdvance}
        onCancel={handleCancelClick}
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

      {/* Detail Modal */}
      <OrderDetailModal
        open={showDetailModal}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
          setShowDetailModal(open);
        }}
        order={detailOrder}
        loading={isLoadingDetail}
        onAdvance={handleAdvance}
        onCancel={(order) => {
          setShowDetailModal(false);
          handleCancelClick(order);
        }}
      />

      {/* Accept Payment Modal */}
      <PosPaymentModal
        open={!!acceptingOrder}
        onOpenChange={(open) => { if (!open) setAcceptingOrder(null); }}
        totalAmount={acceptingOrder ? Number(acceptingOrder.total_amount) : 0}
        onConfirm={handleAcceptPaymentConfirm}
        isLoading={mutations.advanceStatus.isPending}
      />
    </div>
  );
}
