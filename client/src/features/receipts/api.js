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
