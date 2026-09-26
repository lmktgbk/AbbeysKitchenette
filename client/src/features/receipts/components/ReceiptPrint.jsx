import { useState } from "react";
import { orderNumberLabel } from "@/lib/orderNumber";
import faviconUrl from "@/assets/favicon.png";

/**
 * ReceiptPrint (BR-03)
 *
 * 80mm thermal receipt markup. Rendered inside the hidden print root;
 * screen shows the app normally, print shows only this.
 *
 * Logo: bundled favicon (hashed, base-path safe) rendered grayscale via
 * print CSS for thermal printers; falls back to the store name when the
 * image can't load. The host waits for image decode before printing.
 */

function peso(n) {
  return `₱${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function discountTag(order) {
  if (!order?.discount_type || order.discount_type === "none") return null;
  if (order.discount_type === "senior") return "Senior 20%";
  if (order.discount_type === "pwd") return "PWD 20%";
  if (order.discount_type === "mixed") return "Mixed (per-item)";
  if (Number(order.discount_percent) > 0) {
    return `Promo ${order.discount_percent}%${order?.discount_label ? ` ${order.discount_label}` : ""}`;
  }
  if (Number(order.discount_amount) > 0) {
    return `Promo ₱${Number(order.discount_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}${order?.discount_label ? ` ${order.discount_label}` : ""}`;
  }
  return `Promo${order?.discount_label ? ` ${order.discount_label}` : ""}`;
}

function itemDiscountTag(item) {
  if (!item?.discount_type || item.discount_type === "none") return null;
  if (item.discount_type === "senior") return "SNR 20%";
  if (item.discount_type === "pwd") return "PWD 20%";
  // Promo intent is derived from stored fields (no promo_mode column):
  // percent promos keep their %, amount promos show the peso value.
  // Never prints a bare "fixed" — the amount is always on the right.
  if (Number(item.discount_percent) > 0) return `Promo ${item.discount_percent}%`;
  if (Number(item.discount_amount) > 0) return `Promo ₱${Number(item.discount_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  return item.discount_label ? `Promo ${item.discount_label}` : "Promo";
}

export default function ReceiptPrint({ payload }) {
  const [logoMissing, setLogoMissing] = useState(false);
  if (!payload) return null;
  const { order, store } = payload;
  if (!order) return null;

  const dt = order.created_at ? new Date(order.created_at) : new Date();
  const dateStr = dt.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const cashier = order.accepted_by?.name || order.creator_name || "—";
  const tag = discountTag(order);
  const method = (order.payment_method || "cash").toUpperCase();

  return (
    <div className="rc-receipt">
      {/* Store header — bundled logo when loadable, name always */}
      <div className="rc-center">
        {!logoMissing && (
          <img
            src={faviconUrl}
            alt=""
            className="rc-logo"
            onError={() => setLogoMissing(true)}
          />
        )}
        <p className="rc-store">{store?.name || "Abbey's Kitchenette"}</p>
        {store?.address && <p className="rc-small">{store.address}</p>}
        {store?.phone && <p className="rc-small">{store.phone}</p>}
      </div>

      <p className="rc-center rc-disclaimer">*** NOT AN OFFICIAL RECEIPT ***</p>
      <div className="rc-divider" />

      {/* Meta */}
      <div className="rc-row"><span>Order {orderNumberLabel(order.order_number)}</span><span className="rc-right">{order.order_source === "online" ? "Online" : "Walk-in"}</span></div>
      <div className="rc-row"><span>{dateStr}</span><span className="rc-right">Table {order.table_number}</span></div>
      <div className="rc-row"><span>Cashier: {cashier}</span></div>
      <div className="rc-row"><span>Customer: {order.customer_name}</span></div>
      <div className="rc-row"><span>{method}{order.reference_no ? ` ${order.reference_no}` : ""}</span></div>
      <div className="rc-divider" />

      {/* Items */}
      {(order.items ?? []).filter((i) => !i.is_removed).map((item) => (
        <div key={item.order_item_id} className="rc-item">
          <div className="rc-row">
            <span>{item.product_name}{item.size_name ? ` (${item.size_name})` : ""} ×{item.quantity}</span>
            <span className="rc-right">{peso(item.subtotal)}</span>
          </div>
          <div className="rc-row rc-item-sub">
            <span>@ {peso(item.unit_price)}</span>
          </div>
          {itemDiscountTag(item) && Number(item.discount_amount || 0) > 0 && (
            <div className="rc-row rc-item-sub">
              <span>{itemDiscountTag(item)}</span>
              <span className="rc-right">-{peso(item.discount_amount)}</span>
            </div>
          )}
        </div>
      ))}
      <div className="rc-divider" />

      {/* Totals */}
      <div className="rc-row"><span>Subtotal</span><span className="rc-right">{peso(order.subtotal_amount ?? order.total_amount)}</span></div>
      {tag && (
        <>
          <div className="rc-row"><span>Discount {tag}</span><span className="rc-right">-{peso(order.discount_amount)}</span></div>
          {(order.senior_id_no || order.pwd_id_no || order.discount_id_no) && (
            <div className="rc-row"><span>ID {[order.senior_id_no, order.pwd_id_no].filter(Boolean).join(" / ") || order.discount_id_no}</span></div>
          )}
        </>
      )}
      <div className="rc-row rc-total"><span>Total</span><span className="rc-right">{peso(order.total_amount)}</span></div>
      {order.amount_paid != null && (
        <div className="rc-row"><span>Paid</span><span className="rc-right">{peso(order.amount_paid)}</span></div>
      )}
      {order.change != null && (
        <div className="rc-row"><span>Change</span><span className="rc-right">{peso(order.change)}</span></div>
      )}
      {order.refund && Number(order.refund.amount) > 0 && (
        <div className="rc-row"><span>Refunded</span><span className="rc-right">{peso(order.refund.amount)}</span></div>
      )}
      <div className="rc-divider" />

      {/* Footer */}
      <div className="rc-center rc-footer">
        <p>Thank you for dining with us!</p>
        <p className="rc-small">This serves as your order slip.</p>
      </div>
    </div>
  );
}
