import { z } from "zod";
import { LIMITS, searchQuery, queryInteger, integerId, money, orderQuantity } from "../../utils/validation.js";

/**
 * Guest Validation Schemas
 *
 * Public API validation for customer-facing endpoints.
 */

// Order item for guest checkout
const guestOrderItemSchema = z.object({
  product_id: z.string().uuid("Invalid product ID"),
  variant_id: integerId,
  quantity: orderQuantity,
  unit_price: money(true),
});

// POST /api/guest/orders — place online order
export const createGuestOrderSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
  table_number: z
    .string()
    .trim()
    .min(1, "Table number is required")
    .max(20, "Table number must not exceed 20 characters"),
  items: z.array(guestOrderItemSchema).min(1, "At least one item is required").max(LIMITS.orderLines),
});

// GET /api/guest/menu — query params
export const getMenuQuerySchema = z.object({
  search: searchQuery,
  category: queryInteger()
    .optional(),
});

// GET /api/guest/orders/:token — track own order (public, token-gated)
export const guestTokenParamSchema = z.object({
  token: z.string().uuid("Invalid order token"),
});
