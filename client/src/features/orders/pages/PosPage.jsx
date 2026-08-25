import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useOrderMutations } from "../query";
import PosMenuGrid from "../components/PosMenuGrid";
import PosOrderSummary from "../components/PosOrderSummary";
import PosPaymentModal from "../components/PosPaymentModal";
import PosOnlineOrders from "../components/PosOnlineOrders";
import OrderDetailModal from "../components/OrderDetailModal";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

/**
 * PosPage
 *
 * Full-screen POS terminal for creating walk-in orders.
 * Split layout: 70% product menu, 30% order summary.
 * Payment handled in modal on "Place Order".
 */
export default function PosPage() {
  const navigate = useNavigate();
  const mutations = useOrderMutations();

  // ── Order state ─────────────────────
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [tableName, setTableName] = useState("");

  // ── Payment modal ───────────────────
  const [showPayment, setShowPayment] = useState(false);

  // ── Online order detail modal ───────
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // ── Handlers ────────────────────────

  const handleAddItem = useCallback((item) => {
    setItems((prev) => {
      // Check if same variant already exists → increment quantity
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

  async function handlePaymentConfirm({ amount_paid }) {
    try {
      await mutations.create.mutateAsync({
        customer_name: customerName,
        table_number: tableName,
        items: items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        amount_paid,
      });

      toast.success("Order placed successfully");
      setItems([]);
      setCustomerName("");
      setTableName("");
      setShowPayment(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to place order");
    }
  }

  function handleViewOnlineOrder(order) {
    setSelectedOrder(order);
    setShowDetailModal(true);
  }

  async function handleAcceptOnlineOrder(order) {
    const ok = await confirm({
      title: "Accept Online Order?",
      message: `Accept order #${order.order_number} for ${order.customer_name}? This will deduct ingredients.`,
      confirmLabel: "Accept",
      loadingText: "Accepting...",
      variant: "info",
      onConfirm: () => mutations.advanceStatus.mutateAsync({
        id: order.order_id,
        data: { status: "accepted", amount_paid: Number(order.total_amount) },
      }),
    });
    if (ok) toast.success("Online order accepted");
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold">POS</h1>
          {items.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {items.length} items
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/orders")}
          >
            <Icon name="eye" size={16} className="mr-1" />
            Orders
          </Button>
        </div>
      </header>

      {/* Main content — 70/30 split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Product menu (70%) */}
        <div className="flex-[7] overflow-y-auto p-4">
          <PosMenuGrid onAddItem={handleAddItem} />
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
      </div>

      {/* Online orders bar */}
      <PosOnlineOrders
        onViewOrder={handleViewOnlineOrder}
        onAcceptOrder={handleAcceptOnlineOrder}
      />

      {/* Payment modal */}
      <PosPaymentModal
        open={showPayment}
        onOpenChange={setShowPayment}
        totalAmount={subtotal}
        onConfirm={handlePaymentConfirm}
        isLoading={mutations.create.isPending}
      />

      {/* Online order detail modal */}
      <OrderDetailModal
        open={showDetailModal}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
          setShowDetailModal(open);
        }}
        order={selectedOrder}
        showActions={false}
      />
    </div>
  );
}
