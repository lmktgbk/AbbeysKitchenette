/**
 * Receipts API — owns receipt print payload + transactions ledger transport (BR-03).
 * WHY: isolates print event + ledger fetching from POS/admin UI. Contract: GET /orders/:id/receipt, GET /transactions; returns res.data envelope; plus local print-receipt event and localStorage auto-print flag (no backend).
 * State: axios wrappers, no state.
 */
import api from "@/config/axios";

/**
 * Receipts API (BR-03)
 */

// GET /api/orders/:id/receipt — printable payload (order + issuance + store)
export async function getReceiptRequest(orderId) {
  const res = await api.get(`/orders/${orderId}/receipt`);
  return res.data;
}

// GET /api/transactions — money ledger (admin)
export async function getTransactionsRequest(params = {}) {
  const res = await api.get("/transactions", { params });
  return res.data;
}

/**
 * Fire-and-forget print request. ReceiptPrintHost (mounted in the app
 * layouts) listens for this event, fetches the payload, and prints.
 */
export function printReceipt(orderId) {
  window.dispatchEvent(new CustomEvent("print-receipt", { detail: { orderId } }));
}

/**
 * Per-terminal auto-print preference (no backend round-trip).
 * Defaults ON so receipts print unless the cashier opts out.
 */
const AUTO_PRINT_KEY = "pos.autoPrint";

export function shouldAutoPrint() {
  try {
    return window.localStorage.getItem(AUTO_PRINT_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutoPrint(on) {
  try {
    window.localStorage.setItem(AUTO_PRINT_KEY, on ? "on" : "off");
  } catch {
    // storage unavailable — printing still works manually
  }
}

/**
 * Per-terminal paper size (JP-58H is 58mm; default was 80mm).
 * Stored locally so the laptop and the Android tablet can differ.
 */
const PAPER_KEY = "pos.paperSize";

export function getPaperSize() {
  try {
    return window.localStorage.getItem(PAPER_KEY) === "80mm" ? "80mm" : "58mm";
  } catch {
    return "58mm";
  }
}

export function setPaperSize(size) {
  try {
    window.localStorage.setItem(PAPER_KEY, size === "80mm" ? "80mm" : "58mm");
  } catch {
    // ignore — printing still works with the default
  }
}

/**
 * Per-terminal connection: "system" (window.print via USB driver — laptop
 * USB001 or Bluetooth COM8 print queue) or "rawbt" (ESC/POS bytes handed to
 * the RawBT app on Android over Bluetooth SPP).
 */
const CONNECTION_KEY = "pos.printerConnection";

export function getPrinterConnection() {
  try {
    const v = window.localStorage.getItem(CONNECTION_KEY);
    return v === "rawbt" || v === "webusb" ? v : "system";
  } catch {
    return "system";
  }
}

export function setPrinterConnection(conn) {
  try {
    window.localStorage.setItem(
      CONNECTION_KEY,
      conn === "rawbt" || conn === "webusb" ? conn : "system",
    );
  } catch {
    // ignore
  }
}

/**
 * Logo on receipts (B/W raster for ESC/POS, <img> for system print).
 * Defaults ON; turn off for faster prints on the 80-90mm/s JP-58H.
 */
const LOGO_KEY = "pos.receiptLogo";

export function shouldPrintLogo() {
  try {
    return window.localStorage.getItem(LOGO_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setPrintLogo(on) {
  try {
    window.localStorage.setItem(LOGO_KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
}

/**
 * Test print without creating an order. ReceiptPrintHost renders the sample
 * locally (no receipt fetch) so cashiers can verify paper size + Bluetooth.
 */
export function printSampleReceipt() {
  window.dispatchEvent(new CustomEvent("print-receipt-sample"));
}
