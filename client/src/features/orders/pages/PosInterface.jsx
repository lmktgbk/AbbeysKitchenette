import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useOrderMutations } from "../query";
import { getOrderDetailRequest } from "../api";
import PosMenuGrid from "../components/PosMenuGrid";
import PosOrderSummary from "../components/PosOrderSummary";
import PosPaymentModal from "../components/PosPaymentModal";
import PosOnlineOrders from "../components/PosOnlineOrders";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { confirmWithReason } from "@/components/alerts/ConfirmDialog";
import { toLocalDate } from "@/lib/date";

/**
 * PosInterface — POS content only (no header).
 *
 * Full-screen split layout: 70% product menu, 30% order summary.
 * Payment handled in modal on "Place Order".
 * Header is provided by PosTerminal.
 */
export default function PosInterface() {
  const mutations = useOrderMutations();

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

  async function handlePaymentConfirm({ amount_paid }) {
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
      toast.error(err.response?.data?.message || "Failed to place order");
    }
  }

  async function handleRejectOnlineOrder(order) {
    const { confirmed, reason } = await confirmWithReason({
      title: "Reject Order?",
      message: `Reject order #${order.order_number}? This will delete the pending order.`,
      confirmLabel: "Reject",
    });
    if (!confirmed) return;

    try {
      await mutations.cancel.mutateAsync({ id: order.order_id, data: { reason } });
      toast.success(`Order #${order.order_number} rejected`);
    } catch {
      toast.error("Failed to reject order");
    }
  }

  return (
    <>
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
        onConfirm={handlePaymentConfirm}
        isLoading={mutations.create.isPending || mutations.fulfill.isPending}
      />
    </>
  );
}
