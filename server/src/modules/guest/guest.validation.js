import { z } from "zod";

/**
 * Guest Validation Schemas
 *
 * Public API validation for customer-facing endpoints.
 */

// Order item for guest checkout
const guestOrderItemSchema = z.object({
  product_id: z.string().uuid("Invalid product ID"),
  variant_id: z.number().int().positive("Invalid variant ID"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  unit_price: z.number().positive("Price must be greater than zero"),
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
  items: z.array(guestOrderItemSchema).min(1, "At least one item is required"),
});

// GET /api/guest/menu — query params
export const getMenuQuerySchema = z.object({
  search: z.string().optional(),
  category: z
    .string()
    .regex(/^\d+$/, "Category must be a positive integer")
    .optional(),
});
