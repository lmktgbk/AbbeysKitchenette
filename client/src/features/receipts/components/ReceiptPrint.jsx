import { useState } from "react";
import { orderNumberLabel } from "@/lib/orderNumber";
import { receiptMoney as peso, receiptDate, receiptDiscount } from "../receiptFormat";
import faviconUrl from "@/assets/favicon.png";

/**
 * ReceiptPrint (BR-03)
 *
 * Thermal receipt markup for 58mm (JP-58H default) and legacy 80mm.
 * Rendered inside the hidden print root; screen shows the app normally,
 * print shows only this.
 *
 * Logo: bundled favicon (hashed, base-path safe) rendered grayscale via
 * print CSS for thermal printers; falls back to the store name when the
 * image can't load or the terminal disabled logos. The host waits for
 * image decode before printing.
 */

export default function ReceiptPrint({ payload, paperSize = "58mm", showLogo = true }) {
  const [logoMissing, setLogoMissing] = useState(false);
  if (!payload) return null;
  const { order, store } = payload;
  if (!order) return null;

  const dateStr = receiptDate(order.created_at);
  const cashier = order.accepted_by?.name || order.creator_name || "—";
  const tag = receiptDiscount(order);
  const method = (order.payment_method || "cash").toUpperCase();

  return (
    <div className="rc-receipt" data-paper={paperSize}>
      {/* Store header — bundled logo when loadable, name always */}
      <div className="rc-center">
        {showLogo && !logoMissing && (
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
      <p>{dateStr}</p>
      <p>Table: {order.table_number ?? "—"}</p>
      <div className="rc-row"><span>Cashier: {cashier}</span></div>
      <div className="rc-row"><span>Customer: {order.customer_name || "Walk-in"}</span></div>
      <div className="rc-divider" />

      {/* Item amounts are gross; saved discounts explain the difference to the final total. */}
      <div className="rc-row rc-heading"><span>ITEM</span><span className="rc-right">AMOUNT</span></div>
      {(order.items ?? []).filter((i) => !i.is_removed).map((item) => (
        <div key={item.order_item_id} className="rc-item">
          <div className="rc-row rc-item-name">
            <span>{item.quantity} × {item.product_name}</span>
            <span className="rc-right">{peso(item.subtotal)}</span>
          </div>
          <div className="rc-row rc-item-sub">
            <span>{item.size_name ? `${item.size_name} · ` : ""}{peso(item.unit_price)} each</span>
          </div>
          {receiptDiscount(item) && Number(item.discount_amount || 0) > 0 && (
            <div className="rc-row rc-item-sub">
              <span>{receiptDiscount(item)}</span>
              <span className="rc-right">-{peso(item.discount_amount)}</span>
            </div>
          )}
        </div>
      ))}
      <div className="rc-divider" />

      {/* Totals */}
      <div className="rc-row"><span>Subtotal</span><span className="rc-right">{peso(order.subtotal_amount ?? order.total_amount)}</span></div>
      {(tag || Number(order.discount_amount) > 0) && (
        <>
          <div className="rc-row"><span>Total discounts</span><span className="rc-right">-{peso(order.discount_amount)}</span></div>
          {tag && <p className="rc-small">{tag}</p>}
          {(order.senior_id_no || order.pwd_id_no || order.discount_id_no) && (
            <div className="rc-row"><span>ID {[order.senior_id_no, order.pwd_id_no].filter(Boolean).join(" / ") || order.discount_id_no}</span></div>
          )}
        </>
      )}
      <div className="rc-row rc-total"><span>TOTAL</span><span className="rc-right">{peso(order.total_amount)}</span></div>
      <div className="rc-divider" />
      <p>Payment: {method}</p>
      {order.reference_no && <p className="rc-small">Reference: {order.reference_no}</p>}
      {order.amount_paid != null && (
        <div className="rc-row"><span>Amount received</span><span className="rc-right">{peso(order.amount_paid)}</span></div>
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
