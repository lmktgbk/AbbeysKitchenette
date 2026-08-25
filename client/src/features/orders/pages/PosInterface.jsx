import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useOrderMutations } from "../query";
import PosMenuGrid from "../components/PosMenuGrid";
import PosOrderSummary from "../components/PosOrderSummary";
import PosPaymentModal from "../components/PosPaymentModal";
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
        order_date: toLocalDate(),
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

  return (
    <>
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

      {/* Payment modal */}
      <PosPaymentModal
        open={showPayment}
        onOpenChange={setShowPayment}
        totalAmount={subtotal}
        onConfirm={handlePaymentConfirm}
        isLoading={mutations.create.isPending}
      />
    </>
  );
}
