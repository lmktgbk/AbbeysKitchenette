import { z } from "zod";

/**
 * Order Validation Schemas
 *
 * Used by react-hook-form with ZodResolver for POS and order forms.
 */

// ── Order Item ──────────────────────────────────────

const orderItemSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  variant_id: z.number().int().positive("Select a variant"),
  product_name: z.string().optional(),
  size_name: z.string().optional(),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  unit_price: z.number().positive("Price must be greater than zero"),
});

// ── Walk-In Order (POS) ────────────────────────────

export const createWalkInOrderSchema = z.object({
  customer_name: z
    .string()
    .min(1, "Customer name is required")
    .max(100, "Must not exceed 100 characters"),
  table_number: z
    .string()
    .min(1, "Table number is required")
    .max(20, "Must not exceed 20 characters"),
  items: z.array(orderItemSchema).min(1, "Add at least one item"),
  amount_paid: z.number().positive("Amount paid is required"),
});

// ── Edit Pending Order ──────────────────────────────

export const editOrderSchema = z.object({
  customer_name: z
    .string()
    .min(1, "Customer name is required")
    .max(100, "Must not exceed 100 characters")
    .optional(),
  table_number: z
    .string()
    .min(1, "Table number is required")
    .max(20, "Must not exceed 20 characters")
    .optional(),
  items: z.array(orderItemSchema).min(1, "Add at least one item").optional(),
});

// ── Advance Status ──────────────────────────────────

export const advanceStatusSchema = z.object({
  status: z.enum(["accepted", "preparing", "completed"]),
  amount_paid: z.number().positive().optional(),
});

// ── Cancel Order ────────────────────────────────────

export const cancelOrderSchema = z.object({
  reason: z.string().max(500, "Must not exceed 500 characters").optional(),
});

// ── POS Item (for local state, not API) ────────────

export const posItemSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.number().int().positive(),
  product_name: z.string(),
  size_name: z.string(),
  quantity: z.number().int().min(1),
  unit_price: z.number().positive(),
});
