/** Preserve the public snake_case contract for Prisma and raw-query rows. */
// ── Order Number (BR-04: padded YYMMDDNNN) ────────────────
// Stored as Int (always < 2^31), displayed with a dash: 260918-001.
// Legacy short counters (pre-migration) fall back to #0001 style.

/** Compose the persisted daily number from the server's business-date value and database-assigned counter. */
export function composeOrderNumber(orderDate, counter) {
  const d = new Date(orderDate);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return Number(`${yy}${mm}${dd}${String(counter).padStart(3, "0")}`);
}

/** Display current date-prefixed numbers while retaining the legacy short-counter format. */
export function formatOrderNumber(num) {
  const s = String(num ?? "");
  if (/^\d{9}$/.test(s)) return `#${s.slice(0, 6)}-${s.slice(6)}`;
  return `#${s.padStart(4, "0")}`;
}

// ── Response Formatters ─────────────────────────────────

/** Normalize raw SQL or Prisma rows and Decimal values; extra fields intentionally override defaults. */
export function formatOrderResponse(row, extra = {}) {
  return {
    order_id: row.order_id ?? row.orderId,
    order_number: row.order_number ?? row.orderNumber,
    customer_name: row.customer_name ?? row.customerName,
    table_number: row.table_number ?? row.tableNumber,
    order_source: row.order_source ?? row.orderSource,
    status: row.status,
    subtotal_amount: Number(row.subtotal_amount ?? row.subtotalAmount ?? row.total_amount ?? row.totalAmount ?? 0),
    discount_type: row.discount_type ?? row.discountType ?? "none",
    discount_percent: Number(row.discount_percent ?? row.discountPercent ?? 0),
    discount_amount: Number(row.discount_amount ?? row.discountAmount ?? 0),
    discount_label: row.discount_label ?? row.discountLabel ?? null,
    discount_id_no: row.discount_id_no ?? row.discountIdNo ?? null,
    senior_id_no: row.senior_id_no ?? row.seniorIdNo ?? null,
    pwd_id_no: row.pwd_id_no ?? row.pwdIdNo ?? null,
    discount_by: row.discount_by ?? row.discountBy ?? null,
    payment_method: row.payment_method ?? row.paymentMethod ?? "cash",
    reference_no: row.reference_no ?? row.referenceNo ?? null,
    shift_id: row.shift_id ?? row.shiftId ?? null,
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

/** Preserve nullable historic fields and preparation metadata in the public order-line response. */
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
    discount_type: row.discount_type ?? row.discountType ?? "none",
    discount_percent: Number(row.discount_percent ?? row.discountPercent ?? 0),
    discount_amount: Number(row.discount_amount ?? row.discountAmount ?? 0),
    discount_label: row.discount_label ?? row.discountLabel ?? null,
    is_prepared: row.is_prepared ?? row.isPrepared ?? false,
    prepared_by: row.prepared_by ?? row.preparedBy ?? null,
    prepared_by_name: row.prepared_by_name ?? row.preparedByUser?.name ?? null,
    prepared_by_role: row.prepared_by_role ?? row.preparedByUser?.role ?? null,
    prepared_at: row.prepared_at ?? row.preparedAt ?? null,
    category_id: row.category_id ?? row.categoryId ?? null,
    category_name: row.category_name ?? row.categoryName ?? null,
    subcategory_id: row.subcategory_id ?? row.subcategoryId ?? null,
    subcategory_name: row.subcategory_name ?? row.subcategoryName ?? null,
  };
}
