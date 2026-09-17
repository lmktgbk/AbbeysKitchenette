import { useRef } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

/**
 * ReceiptPrinter — renders a thermal 80mm receipt and supports print.
 *
 * Props:
 * - receipt: object from GET /api/orders/:id/receipt
 * - onClose: () => void
 */

const DIVIDER = "─".repeat(32);
const DIVIDER_DASH = "┄".repeat(32);

export default function ReceiptPrinter({ receipt, onClose }) {
  const printRef = useRef(null);

  if (!receipt) return null;

  function handlePrint() {
    const printWindow = window.open("", "_blank", "width=320,height=600");
    if (!printWindow) return;

    const html = generateReceiptHTML(receipt);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* On-screen preview */}
      <div
        ref={printRef}
        className="w-[320px] bg-white p-4 font-mono text-xs text-black shadow-lg print:shadow-none"
        style={{ lineHeight: "1.4" }}
      >
        <ReceiptContent receipt={receipt} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button size="sm" onClick={handlePrint}>
          <Icon name="printer" size={14} className="mr-1" />
          Print Receipt
        </Button>
      </div>
    </div>
  );
}

function ReceiptContent({ receipt }) {
  return (
    <div className="text-center">
      {/* Store Header */}
      <div className="mb-1 text-sm font-bold">{receipt.store_name}</div>
      <div className="mb-2 text-[10px] text-gray-500">{receipt.store_tagline}</div>
      <div className="text-[10px] text-gray-400">{DIVIDER}</div>

      {/* Order Info */}
      <div className="my-2 text-left">
        <div className="flex justify-between">
          <span>Order #:</span>
          <span className="font-bold">{receipt.order_number}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{receipt.date}</span>
        </div>
        <div className="flex justify-between">
          <span>Time:</span>
          <span>{receipt.time}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier:</span>
          <span>{receipt.cashier}</span>
        </div>
        <div className="flex justify-between">
          <span>Customer:</span>
          <span>{receipt.customer}</span>
        </div>
        <div className="flex justify-between">
          <span>Table:</span>
          <span>{receipt.table}</span>
        </div>
      </div>

      <div className="text-[10px] text-gray-400">{DIVIDER}</div>

      {/* Items */}
      <div className="my-2 text-left">
        {receipt.items.map((item, idx) => (
          <div key={idx} className="mb-1">
            <div className="flex justify-between">
              <span className="font-bold">
                {item.quantity}x {item.name}
              </span>
              <span>₱{item.subtotal.toLocaleString()}</span>
            </div>
            {item.size && (
              <div className="pl-4 text-[10px] text-gray-500">
                {item.size} @ ₱{item.unit_price.toLocaleString()}
              </div>
            )}
            {item.discount > 0 && (
              <div className="pl-4 text-[10px] text-green-600">
                Discount: -₱{item.discount.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-[10px] text-gray-400">{DIVIDER}</div>

      {/* Totals */}
      <div className="my-2 text-left">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>₱{receipt.subtotal.toLocaleString()}</span>
        </div>
        {receipt.discounts.map((disc, idx) => (
          <div key={idx} className="flex justify-between text-green-600">
            <span>{disc.label}:</span>
            <span>-₱{disc.amount.toLocaleString()}</span>
          </div>
        ))}
        {receipt.vat_amount > 0 && (
          <div className="flex justify-between">
            <span>VAT (12%):</span>
            <span>₱{receipt.vat_amount.toLocaleString()}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-gray-300 pt-1">
          <span className="font-bold">TOTAL:</span>
          <span className="font-bold">₱{receipt.net_amount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Payment:</span>
          <span>{receipt.payment_method?.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Cash:</span>
          <span>₱{receipt.amount_paid.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Change:</span>
          <span>₱{receipt.change.toLocaleString()}</span>
        </div>
      </div>

      <div className="text-[10px] text-gray-400">{DIVIDER}</div>

      {/* Footer */}
      <div className="mt-2 text-[10px] text-gray-500">
        Thank you for your purchase!
      </div>
      <div className="text-[10px] text-gray-400">
        {DIVIDER_DASH}
      </div>
    </div>
  );
}

function generateReceiptHTML(receipt) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Receipt #${receipt.order_number}</title>
  <style>
    @media print {
      @page { size: 80mm auto; margin: 2mm; }
      body { margin: 0; padding: 2mm; }
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      width: 76mm;
      margin: 0 auto;
      color: #000;
      line-height: 1.4;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #999; margin: 4px 0; }
    .item { margin-bottom: 2px; }
    .item-row { display: flex; justify-content: space-between; }
    .indent { padding-left: 8px; font-size: 10px; color: #666; }
    .discount { color: #16a34a; font-size: 10px; }
    .total-line { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
    .footer { margin-top: 8px; font-size: 10px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="center bold" style="font-size: 14px;">${receipt.store_name}</div>
  <div class="center" style="font-size: 10px; color: #666;">${receipt.store_tagline}</div>
  <div class="divider"></div>

  <div class="item-row"><span>Order #:</span><span class="bold">${receipt.order_number}</span></div>
  <div class="item-row"><span>Date:</span><span>${receipt.date}</span></div>
  <div class="item-row"><span>Time:</span><span>${receipt.time}</span></div>
  <div class="item-row"><span>Cashier:</span><span>${receipt.cashier}</span></div>
  <div class="item-row"><span>Customer:</span><span>${receipt.customer}</span></div>
  <div class="item-row"><span>Table:</span><span>${receipt.table}</span></div>

  <div class="divider"></div>

  ${receipt.items.map(item => `
    <div class="item">
      <div class="item-row"><span class="bold">${item.quantity}x ${item.name}</span><span>₱${item.subtotal.toLocaleString()}</span></div>
      ${item.size ? `<div class="indent">${item.size} @ ₱${item.unit_price.toLocaleString()}</div>` : ''}
      ${item.discount > 0 ? `<div class="indent discount">Discount: -₱${item.discount.toLocaleString()}</div>` : ''}
    </div>
  `).join("")}

  <div class="divider"></div>

  <div class="item-row"><span>Subtotal:</span><span>₱${receipt.subtotal.toLocaleString()}</span></div>
  ${receipt.discounts.map(d => `
    <div class="item-row discount"><span>${d.label}:</span><span>-₱${d.amount.toLocaleString()}</span></div>
  `).join("")}
  ${receipt.vat_amount > 0 ? `<div class="item-row"><span>VAT (12%):</span><span>₱${receipt.vat_amount.toLocaleString()}</span></div>` : ''}
  <div class="item-row total-line bold"><span>TOTAL:</span><span>₱${receipt.net_amount.toLocaleString()}</span></div>
  <div class="item-row"><span>Payment:</span><span>${receipt.payment_method?.toUpperCase()}</span></div>
  <div class="item-row"><span>Cash:</span><span>₱${receipt.amount_paid.toLocaleString()}</span></div>
  <div class="item-row bold"><span>Change:</span><span>₱${receipt.change.toLocaleString()}</span></div>

  <div class="divider"></div>
  <div class="footer">Thank you for your purchase!</div>
</body>
</html>`;
}
