import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useOrderMutations } from "../query";
import { useMyShifts, useShiftMutations } from "@/features/shifts/query";
import ShiftBanner from "@/features/shifts/components/ShiftBanner";
import OpenShiftModal from "@/features/shifts/components/OpenShiftModal";
import CloseShiftModal from "@/features/shifts/components/CloseShiftModal";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { getOrderDetailRequest } from "../api";
import PosMenuGrid from "../components/PosMenuGrid";
import PosOrderSummary from "../components/PosOrderSummary";
import PosPaymentModal from "../components/PosPaymentModal";
import PosOnlineOrders from "../components/PosOnlineOrders";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { confirmWithReason } from "@/components/alerts/ConfirmDialog";
import { toLocalDate } from "@/lib/date";

const CANCEL_REASONS = [
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "wrong_order", label: "Wrong order" },
  { value: "duplicate", label: "Duplicate order" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "other", label: "Other" },
];

/**
 * PosInterface — POS content only (no header).
 *
 * Full-screen split layout: 70% product menu, 30% order summary.
 * Payment handled in modal on "Place Order".
 * Header is provided by PosTerminal.
 */
export default function PosInterface() {
  const mutations = useOrderMutations();
  const shiftMutations = useShiftMutations();
  const { data: shiftsData, isLoading: shiftsLoading } = useMyShifts();
  const shifts = shiftsData?.data?.shifts ?? [];

  // ── Shift state ───────────────────────
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [closingShift, setClosingShift] = useState(null);

  // ── Order state ─────────────────────
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [tableName, setTableName] = useState("");

  // ── Payment modal ───────────────────
  const [showPayment, setShowPayment] = useState(false);

  // ── Online order fulfillment ────────
  const [fulfillingOrderId, setFulfillingOrderId] = useState(null);

  // ── Online orders sidebar ──────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Handlers ────────────────────────

  const handleAddItem = useCallback((item) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.variant_id === item.variant_id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + 1,
        };
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const handleUpdateQuantity = useCallback((idx, qty) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], quantity: qty };
      return updated;
    });
  }, []);

  const handleRemoveItem = useCallback((idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  function handlePlaceOrder() {
    if (items.length === 0 || !customerName || !tableName) return;
    setShowPayment(true);
  }

  async function handleAcceptOnlineOrder(order) {
    if (items.length > 0) {
      const yes = await confirm(
        `Load order #${order.order_number}? This will replace the current order.`
      );
      if (!yes) return;
    }

    try {
      const res = await getOrderDetailRequest(order.order_id);
      const orderData = res.data.order;

      setItems(
        orderData.items.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product_name,
          size_name: item.size_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
        }))
      );
      setCustomerName(orderData.customer_name || "");
      setTableName(orderData.table_number || "");
      setFulfillingOrderId(order.order_id);

      toast.success(`Loaded order #${order.order_number}`);
    } catch {
      toast.error("Failed to load order details");
    }
  }

  async function handlePaymentConfirm({ amount_paid, discount_type, promo_mode, promo_value, discount_id_no, discount_label, payment_method, reference_no }) {
    const payload = {
      customer_name: customerName,
      table_number: tableName,
      items: items.map((i) => ({
        product_id: i.product_id,
        variant_id: i.variant_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      amount_paid,
      discount_type,
      promo_mode,
      promo_value,
      discount_id_no,
      discount_label,
      payment_method,
      reference_no,
    };

    try {
      if (fulfillingOrderId) {
        await mutations.fulfill.mutateAsync({ id: fulfillingOrderId, data: payload });
        toast.success("Order fulfilled");
      } else {
        await mutations.create.mutateAsync({ ...payload, order_date: toLocalDate() });
        toast.success("Order placed successfully");
      }

      setItems([]);
      setCustomerName("");
      setTableName("");
      setFulfillingOrderId(null);
      setShowPayment(false);
    } catch (err) {
      if (err.response?.data?.error === "SHIFT_REQUIRED") {
        toast.error("Open a shift before taking payments");
        setShowPayment(false);
        setShowOpenShift(true);
        return;
      }
      toast.error(err.response?.data?.message || "Failed to place order");
    }
  }

  async function handleRejectOnlineOrder(order) {
    await confirmWithReason({
      title: "Delete Order?",
      message: `Delete order #${order.order_number}? This will permanently remove the order.`,
      confirmLabel: "Delete",
      reasons: CANCEL_REASONS,
      loadingText: "Deleting...",
      onConfirm: async ({ reason, custom_reason }) => {
        await mutations.cancel.mutateAsync({ id: order.order_id, data: { reason, custom_reason } });
        toast.success("Order deleted");
      },
    });
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
    try {
      const res = await shiftMutations.close.mutateAsync({ id: closingShift.shift_id, data });
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

  // BR-02: no open drawer session → gate the whole POS behind shift open.
  if (!shiftsLoading && shifts.length === 0) {
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Icon name="wallet" size={26} className="text-muted-foreground" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Open a shift to start selling</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Count the drawer and declare the opening cash. Every payment you take is tracked against this shift.
            </p>
          </div>
          <Button onClick={() => setShowOpenShift(true)}>
            Open shift
          </Button>
        </div>

        <OpenShiftModal
          open={showOpenShift}
          onOpenChange={setShowOpenShift}
          onConfirm={handleOpenShiftConfirm}
          isLoading={shiftMutations.open.isPending}
        />
      </>
    );
  }

  return (
    <>
      {/* Shift bar */}
      <div className="border-b border-border px-4 py-2">
        <ShiftBanner
          compact
          shifts={shifts}
          isLoading={shiftsLoading}
          onOpenShift={() => setShowOpenShift(true)}
          onCloseShift={setClosingShift}
        />
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Center: Product menu */}
        <div className="flex-[7] overflow-y-auto p-4">
          <PosMenuGrid
            onAddItem={handleAddItem}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((s) => !s)}
          />
        </div>

        {/* Right: Order summary (30%) */}
        <div className="flex-[3] border-l border-border">
          <PosOrderSummary
            items={items}
            customerName={customerName}
            tableName={tableName}
            onCustomerNameChange={setCustomerName}
            onTableNameChange={setTableName}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onPlaceOrder={handlePlaceOrder}
          />
        </div>

        {/* Online orders sidebar — absolute overlay */}
        <PosOnlineOrders
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onAcceptOrder={handleAcceptOnlineOrder}
          onRejectOrder={handleRejectOnlineOrder}
        />
      </div>

      {/* Payment modal */}
      <PosPaymentModal
        open={showPayment}
        onOpenChange={setShowPayment}
        totalAmount={subtotal}
        orderSummary={{
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
          customerName,
          tableName,
          items: items.map((i) => ({
            product_name: i.product_name,
            size_name: i.size_name,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
        }}
        onConfirm={handlePaymentConfirm}
        isLoading={mutations.create.isPending || mutations.fulfill.isPending}
      />

      {/* Shift modals */}
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
        onConfirm={handleCloseShiftConfirm}
        isLoading={shiftMutations.close.isPending}
      />
    </>
  );
}
