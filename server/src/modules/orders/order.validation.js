import { z } from "zod";

/**
 * Order Validation Schemas
 *
 * Validates request bodies, query params, and route params for orders.
 * If validation fails → error response, controller never executes.
 */

// ── Nested Schemas ──────────────────────────────────────

// Order item: product + variant + quantity + price
const orderItemSchema = z.object({
  product_id: z.string().uuid("Invalid product ID"),
  variant_id: z.number().int().positive("Invalid variant ID"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  unit_price: z.number().positive("Price must be greater than zero"),
});

// ── BR-01: Discount + Payment Schemas ─────────────────────

// Single discount per order. Senior/PWD fixed 20%. Promo manual.
const discountTypeEnum = z.enum(["none", "senior", "pwd", "promo"], {
  errorMap: () => ({ message: "discount_type must be none, senior, pwd, or promo" }),
});

const paymentMethodEnum = z.enum(["cash", "gcash", "maya"], {
  errorMap: () => ({ message: "payment_method must be cash, gcash, or maya" }),
});

const discountInputSchema = z.object({
  discount_type: discountTypeEnum.optional().default("none"),
  // promo only: "percent" | "amount"
  promo_mode: z.enum(["percent", "amount"], {
    errorMap: () => ({ message: "promo_mode must be percent or amount" }),
  }).optional(),
  // promo only: percent 0-100 or peso amount
  promo_value: z.number().min(0, "Promo value must be non-negative").optional(),
  // senior/pwd only: ID number for audit
  discount_id_no: z.string().trim().max(50, "ID number must not exceed 50 characters").optional(),
  // promo only: label/reason
  discount_label: z.string().trim().max(200, "Promo label must not exceed 200 characters").optional(),
});

const paymentInputSchema = z.object({
  payment_method: paymentMethodEnum.optional().default("cash"),
  // required for gcash/maya (record-only, no gateway)
  reference_no: z.string().trim().max(100, "Reference number must not exceed 100 characters").optional(),
});

// ── Body Schemas ────────────────────────────────────────

// POST /api/orders — create walk-in order (auto-accepted)
export const createOrderSchema = discountInputSchema.merge(paymentInputSchema).merge(z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(100, "Name must not exceed 100 characters"),
  table_number: z
    .string()
    .trim()
    .min(1, "Table number is required")
    .max(20, "Table number must not exceed 20 characters"),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  amount_paid: z.number().positive("Amount paid must be greater than zero"),
  order_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .optional(),
})).superRefine((data, ctx) => {
  if (data.discount_type === "promo") {
    if (!data.promo_mode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promo_mode is required for promo discount", path: ["promo_mode"] });
    }
    if (data.promo_value == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promo_value is required for promo discount", path: ["promo_value"] });
    } else if (data.promo_mode === "percent" && data.promo_value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Promo percent must not exceed 100", path: ["promo_value"] });
    }
  }
  if (data.payment_method !== "cash" && !data.reference_no) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "reference_no is required for gcash or maya", path: ["reference_no"] });
  }
});

// PUT /api/orders/:id — edit pending order
export const updateOrderSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(100, "Name must not exceed 100 characters")
    .optional(),
  table_number: z
    .string()
    .trim()
    .min(1, "Table number is required")
    .max(20, "Table number must not exceed 20 characters")
    .optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required").optional(),
});

// POST /api/orders/:id/fulfill — fulfill pending online order (edit + accept in one shot)
export const fulfillOrderSchema = discountInputSchema.merge(paymentInputSchema).merge(z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, "Customer name is required")
    .max(100, "Name must not exceed 100 characters")
    .optional(),
  table_number: z
    .string()
    .trim()
    .min(1, "Table number is required")
    .max(20, "Table number must not exceed 20 characters")
    .optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
  amount_paid: z.number().positive("Amount paid must be greater than zero"),
})).superRefine((data, ctx) => {
  if (data.discount_type === "promo") {
    if (!data.promo_mode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promo_mode is required for promo discount", path: ["promo_mode"] });
    }
    if (data.promo_value == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "promo_value is required for promo discount", path: ["promo_value"] });
    } else if (data.promo_mode === "percent" && data.promo_value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Promo percent must not exceed 100", path: ["promo_value"] });
    }
  }
  if (data.payment_method !== "cash" && !data.reference_no) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "reference_no is required for gcash or maya", path: ["reference_no"] });
  }
});

// PUT /api/orders/:id/status — advance order status
export const updateStatusSchema = z.object({
  status: z.enum(["accepted", "preparing", "completed"], {
    errorMap: () => ({ message: "Invalid status transition" }),
  }),
  // Payment fields (only for pending → accepted)
  amount_paid: z.number().positive().optional(),
  discount_type: discountTypeEnum.optional(),
  promo_mode: z.enum(["percent", "amount"]).optional(),
  promo_value: z.number().min(0).optional(),
  discount_id_no: z.string().trim().max(50).optional(),
  discount_label: z.string().trim().max(200).optional(),
  payment_method: paymentMethodEnum.optional(),
  reference_no: z.string().trim().max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.status === "accepted" && data.payment_method && data.payment_method !== "cash" && !data.reference_no) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "reference_no is required for gcash or maya", path: ["reference_no"] });
  }
});

// ── Shared Constants ──────────────────────────────

export const CANCEL_REASONS = [
  { value: "customer_changed_mind", label: "Customer changed mind" },
  { value: "wrong_order", label: "Wrong order" },
  { value: "duplicate", label: "Duplicate order" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "other", label: "Other" },
];

const cancelReasonEnum = z.enum(
  CANCEL_REASONS.map((r) => r.value),
  { errorMap: () => ({ message: "Invalid cancellation reason" }) },
);

// POST /api/orders/:id/cancel — cancel/delete order
export const cancelOrderSchema = z.object({
  reason: cancelReasonEnum,
  custom_reason: z.string().trim().max(500, "Custom reason must not exceed 500 characters").optional(),
  loss_option: z
    .enum(["no_loss", "with_loss"], {
      errorMap: () => ({ message: "loss_option must be 'no_loss' or 'with_loss'" }),
    })
    .optional()
    .default("no_loss"),
  refund_option: z
    .enum(["full", "partial", "none"], {
      errorMap: () => ({ message: "refund_option must be 'full', 'partial', or 'none'" }),
    })
    .optional()
    .default("partial"),
  refund_amount: z.number().min(0, "Refund amount must be non-negative").optional(),
  item_losses: z
    .array(
      z.object({
        order_item_id: z.number().int().positive(),
        ingredient_losses: z
          .array(
            z.object({
              ingredient_id: z.string().uuid(),
              quantity_lost: z.number().positive(),
            })
          )
          .optional()
          .default([]),
      })
    )
    .optional()
    .default([]),
});

// POST /api/orders/:id/items/:itemId/remove — remove item from order
export const removeItemSchema = z.object({
  reason: cancelReasonEnum,
  custom_reason: z.string().trim().max(500, "Custom reason must not exceed 500 characters").optional(),
  loss_option: z
    .enum(["no_loss", "with_loss"], {
      errorMap: () => ({ message: "loss_option must be 'no_loss' or 'with_loss'" }),
    })
    .optional()
    .default("no_loss"),
  refund_option: z
    .enum(["full", "partial", "none"], {
      errorMap: () => ({ message: "refund_option must be 'full', 'partial', or 'none'" }),
    })
    .optional()
    .default("partial"),
  refund_amount: z.number().min(0, "Refund amount must be non-negative").optional(),
  ingredient_losses: z
    .array(
      z.object({
        ingredient_id: z.string().uuid(),
        quantity_lost: z.number().positive(),
      }),
    )
    .optional()
    .default([]),
});

// POST /api/orders/:id/prepare — transition to preparing
export const prepareOrderSchema = z.object({});

// PATCH /api/orders/:id/items/:itemId — toggle item prepared
export const checkOrderItemSchema = z.object({
  is_prepared: z.boolean(),
});

// POST /api/orders/losses/:lossId/override — override a loss record
export const overrideLossSchema = z.object({
  override_reason: z.enum(["transferred", "not_used", "other"], {
    errorMap: () => ({ message: "Invalid override reason" }),
  }),
  override_note: z
    .string()
    .trim()
    .max(500, "Note must not exceed 500 characters")
    .optional(),
});

// ── Param Schemas ───────────────────────────────────────

export const orderIdParamSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
});

export const orderItemParamSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
  itemId: z.string().regex(/^\d+$/, "Invalid item ID"),
});

export const lossIdParamSchema = z.object({
  lossId: z.string().regex(/^\d+$/, "Invalid loss ID"),
});

// ── Query Schemas ───────────────────────────────────────

// GET /api/orders — paginated list with filters
export const getOrdersQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .optional()
    .default("50"),
  search: z.string().optional(),
  status: z
    .string()
    .optional()
    .default("all"),
  date_from: z.string().optional(), // YYYY-MM-DD
  date_to: z.string().optional(),   // YYYY-MM-DD
  sortBy: z
    .enum(["order_number", "customer_name", "total_amount", "created_at", "status"])
    .optional()
    .default("created_at"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  staff_id: z.string().uuid("Invalid staff ID").optional(),
});
