/**
 * Order Utilities
 *
 * Status map, valid transitions, and response formatters.
 * Single source of truth for order status logic.
 */

// ── Status Map ──────────────────────────────────────────

/**
 * Valid status transitions.
 * Key = current status, value = array of allowed next statuses.
 */
export const VALID_TRANSITIONS = {
  pending: ["accepted", "cancelled"],
  accepted: ["next_in_line", "cancelled"],
  next_in_line: ["processing", "cancelled"],
  processing: ["completed"],
  completed: [],
  cancelled: [],
};

/**
 * Status labels for display.
 */
export const STATUS_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  next_in_line: "Next in Line",
  processing: "Processing",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Timestamp field name for each status (used for FIFO ordering).
 */
export const STATUS_TIMESTAMP_FIELD = {
  pending: "created_at",
  accepted: "accepted_at",
  next_in_line: "next_in_line_at",
  processing: "processing_at",
  completed: "completed_at",
};

// ── Status Helpers ──────────────────────────────────────

/**
 * Check if a status transition is valid.
 * @param {string} from - current status
 * @param {string} to - target status
 * @returns {boolean}
 */
export function isValidTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get the next status in the natural flow.
 * @param {string} current - current status
 * @returns {string|null} - next status or null if terminal
 */
export function getNextStatus(current) {
  const flow = ["pending", "accepted", "next_in_line", "processing", "completed"];
  const idx = flow.indexOf(current);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1];
}

// ── Order Number Formatting ─────────────────────────────

/**
 * Format order number for display.
 * @param {number} num - raw order number
 * @returns {string} - formatted like "#0001"
 */
export function formatOrderNumber(num) {
  return `#${String(num).padStart(4, "0")}`;
}

// ── Response Formatters ─────────────────────────────────

/**
 * Map raw SQL order row to snake_case API response.
 * Handles both raw SQL (snake_case) and Prisma (camelCase) keys.
 * @param {object} row - order row from DB
 * @param {object} [extra] - additional fields
 * @returns {object} - formatted order response
 */
export function formatOrderResponse(row, extra = {}) {
  return {
    order_id: row.order_id ?? row.orderId,
    order_number: row.order_number ?? row.orderNumber,
    customer_name: row.customer_name ?? row.customerName,
    table_number: row.table_number ?? row.tableNumber,
    order_source: row.order_source ?? row.orderSource,
    status: row.status,
    total_amount: Number(row.total_amount ?? row.totalAmount ?? 0),
    amount_paid: row.amount_paid != null ? Number(row.amount_paid) : row.amountPaid != null ? Number(row.amountPaid) : null,
    change: row.change != null ? Number(row.change) : null,
    guest_token: row.guest_token ?? row.guestToken ?? null,
    // Status timestamps
    accepted_at: row.accepted_at ?? row.acceptedAt ?? null,
    accepted_by: row.accepted_by ?? row.acceptedBy ?? null,
    next_in_line_at: row.next_in_line_at ?? row.nextInLineAt ?? null,
    processing_at: row.processing_at ?? row.processingAt ?? null,
    processing_by: row.processing_by ?? row.processingBy ?? null,
    completed_at: row.completed_at ?? row.completedAt ?? null,
    completed_by: row.completed_by ?? row.completedBy ?? null,
    // Metadata
    created_by: row.created_by ?? row.createdBy,
    created_at: row.created_at ?? row.createdAt,
    updated_at: row.updated_at ?? row.updatedAt,
    ...extra,
  };
}

/**
 * Map raw SQL order item row to snake_case API response.
 * @param {object} row - order item row
 * @returns {object} - formatted item response
 */
export function formatOrderItemResponse(row) {
  return {
    order_item_id: row.order_item_id ?? row.orderItemId,
    product_id: row.product_id ?? row.productId,
    product_name: row.product_name ?? row.productName,
    variant_id: row.variant_id ?? row.variantId,
    size_name: row.size_name ?? row.sizeName,
    quantity: row.quantity,
    unit_price: Number(row.unit_price ?? row.unitPrice),
    subtotal: row.subtotal != null ? Number(row.subtotal) : null,
  };
}
