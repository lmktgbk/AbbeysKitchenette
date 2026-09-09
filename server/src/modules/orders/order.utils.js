/**
 * Order Utilities
 *
 * Status map, valid transitions, and response formatters.
 * Single source of truth for order status logic.
 */

// ── Status Map ──────────────────────────────────────────

export const VALID_TRANSITIONS = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const STATUS_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_TIMESTAMP_FIELD = {
  pending: "created_at",
  accepted: "accepted_at",
  preparing: "preparing_at",
  completed: "completed_at",
};

export function isValidTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatus(current) {
  const flow = ["pending", "accepted", "preparing", "completed"];
  const idx = flow.indexOf(current);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1];
}

// ── Order Number Formatting ─────────────────────────────

export function formatOrderNumber(num) {
  return `#${String(num).padStart(4, "0")}`;
}

// ── Response Formatters ─────────────────────────────────

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
    accepted_at: row.accepted_at ?? row.acceptedAt ?? null,
    accepted_by: row.accepted_by ?? row.acceptedBy ?? null,
    preparing_at: row.preparing_at ?? row.preparingAt ?? null,
    preparing_by: row.preparing_by ?? row.preparingBy ?? null,
    completed_at: row.completed_at ?? row.completedAt ?? null,
    completed_by: row.completed_by ?? row.completedBy ?? null,
    fulfillment_minutes: row.fulfillment_minutes ?? row.fulfillmentMinutes ?? null,
    created_by: row.created_by ?? row.createdBy,
    created_at: row.created_at ?? row.createdAt,
    updated_at: row.updated_at ?? row.updatedAt,
    ...extra,
  };
}

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
    is_prepared: row.is_prepared ?? row.isPrepared ?? false,
    prepared_by: row.prepared_by ?? row.preparedBy ?? null,
    prepared_by_name: row.preparedByUser?.name ?? null,
    prepared_by_role: row.preparedByUser?.role ?? null,
    prepared_at: row.prepared_at ?? row.preparedAt ?? null,
    category_id: row.category_id ?? row.categoryId ?? null,
    category_name: row.category_name ?? row.categoryName ?? null,
    subcategory_id: row.subcategory_id ?? row.subcategoryId ?? null,
    subcategory_name: row.subcategory_name ?? row.subcategoryName ?? null,
  };
}
