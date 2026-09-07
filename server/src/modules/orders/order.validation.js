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

// ── Body Schemas ────────────────────────────────────────

// POST /api/orders — create walk-in order (auto-accepted)
export const createOrderSchema = z.object({
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
export const fulfillOrderSchema = z.object({
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
});

// PUT /api/orders/:id/status — advance order status
export const updateStatusSchema = z.object({
  status: z.enum(["accepted", "next_in_line", "processing", "completed"], {
    errorMap: () => ({ message: "Invalid status transition" }),
  }),
  // Payment fields (only for pending → accepted)
  amount_paid: z.number().positive().optional(),
});

// POST /api/orders/:id/cancel — cancel/delete order
export const cancelOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "Reason must not exceed 500 characters")
    .optional(),
});

// ── Param Schemas ───────────────────────────────────────

export const orderIdParamSchema = z.object({
  id: z.string().uuid("Invalid order ID"),
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
});
