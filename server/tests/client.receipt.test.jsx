import React from "../../client/node_modules/react/index.js";
import { renderToStaticMarkup } from "../../client/node_modules/react-dom/server.node.js";
import { expect, it } from "vitest";
import ReceiptPrint from "../../client/src/features/receipts/components/ReceiptPrint.jsx";
import { buildReceiptBytes, rasterCommand } from "../../client/src/features/receipts/escpos.js";
import { receiptMoney, receiptDate } from "../../client/src/features/receipts/receiptFormat.js";

const longName = "Very long café product name with repeated details and a uniquely identifiable ending FINISH";
const payload = { store: { name: "Abbey's Kitchenette", address: "Lipa City, Batangas", phone: "12345" }, order: {
  order_number: 261011001, created_at: "2026-10-11T05:30:00Z", customer_name: "Guest", table_number: 4,
  payment_method: "maya", reference_no: "1234567890123456789012345678901234567890",
  items: [{ order_item_id: "a", product_name: longName, size_name: "Cold 16oz", quantity: 1, unit_price: 150, subtotal: 150, discount_type: "senior", discount_amount: 30 },
    { order_item_id: "b", product_name: "REMOVED", is_removed: true }],
  subtotal_amount: 150, discount_type: "mixed", discount_amount: 30, total_amount: 120,
  amount_paid: 120, change: 0, refund: { amount: 20 },
} };
// Remove printer formatting commands, retaining the text sent to the firmware.
function printedText(bytes) {
  return new TextDecoder().decode(bytes).replace(/\x1b[MaEd][\x00-\xff]/g, "").replace(/\x1d![\x00-\xff]/g, "").replace(/\x1b@/g, "");
}
it.each(["58mm", "80mm"])("preserves settlements, discounts and wrapped text on %s", paperSize => {
  const html = renderToStaticMarkup(<ReceiptPrint payload={payload} paperSize={paperSize} />);
  expect(html).toContain("rc-logo");
  expect(html).toContain("Senior discount 20%");
  expect(html).toContain("₱120.00"); expect(html).toContain("Refunded");
  expect(html).not.toContain("REMOVED");
  const text = printedText(buildReceiptBytes(payload, { paperSize }));
  expect(text).toContain("FINISH"); expect(text).toContain("Senior discount 20%");
  expect(text).toContain("P120.00"); expect(text).toContain("Refunded");
  expect(text).not.toContain("REMOVED");
  expect(text).toContain("#261011-001");
  const columns = paperSize === "80mm" ? 48 : 32;
  expect(text.split("\n").every(line => line.length <= columns)).toBe(true);
});
it("uses two decimal places and Manila time", () => {
  expect(receiptMoney(2223.253)).toBe("₱2,223.25");
  expect(receiptDate("2026-10-11T05:30:00Z")).toContain("1:30 PM");
});
it("preserves the logo option in raw printer jobs", () => {
  const raster = { width: 8, height: 1, data: [0xff] };
  const on = Array.from(buildReceiptBytes(payload, { logoRaster: raster }));
  const off = Array.from(buildReceiptBytes(payload, { logoRaster: raster, includeLogo: false }));
  expect(on.join(",")).toContain(rasterCommand(raster).join(","));
  expect(off.join(",")).not.toContain(rasterCommand(raster).join(","));
  expect(renderToStaticMarkup(<ReceiptPrint payload={payload} showLogo={false} />)).not.toContain("rc-logo");
});
