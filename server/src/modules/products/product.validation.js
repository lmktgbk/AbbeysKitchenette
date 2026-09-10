import { z } from "zod";

/**
 * Product Validation Schemas
 *
 * Used by validate middleware to validate request bodies.
 * If validation fails → error response, controller never executes.
 */

// ── Nested Schemas ────────────────────────────────

// Recipe entry: one ingredient per variant
const recipeEntrySchema = z.object({
  ingredient_id: z.string().uuid("Invalid ingredient ID"),
  quantity_needed: z.number().positive("Quantity must be greater than zero"),
});

// Variant entry: size with price and optional recipes
const variantEntrySchema = z.object({
  variant_id: z.number().int().positive().optional(), // existing variant (edit mode)
  size_name: z
    .string()
    .trim()
    .min(1, "Size name is required")
    .max(50, "Size name must not exceed 50 characters"),
  price: z.number().positive("Price must be greater than zero"),
  is_available: z.boolean().optional().default(true),
  recipes: z.array(recipeEntrySchema).optional().default([]),
});

// ── Product Schemas ───────────────────────────────

// Used by POST /api/products — create product with variants and recipes
export const createProductSchema = z.object({
  product_name: z
    .string()
    .trim()
    .min(1, "Product name is required")
    .max(150, "Product name must not exceed 150 characters"),
  subcategory_id: z.number().int().positive("Subcategory is required"),
  description: z
    .string()
    .trim()
    .max(500, "Description must not exceed 500 characters")
    .optional()
    .nullable(),
  image_url: z.string().max(500).optional().nullable(),
  is_available: z.boolean().optional().default(true),
  variants: z
    .array(variantEntrySchema)
    .min(1, "At least one variant is required"),
});

// Used by PATCH /api/products/:id — update product info only
export const updateProductSchema = z.object({
  product_name: z
    .string()
    .trim()
    .min(1, "Product name is required")
    .max(150, "Product name must not exceed 150 characters")
    .optional(),
  subcategory_id: z.number().int().positive("Subcategory is required").optional(),
  description: z
    .string()
    .trim()
    .max(500, "Description must not exceed 500 characters")
    .optional(),
  image_url: z.string().max(500).optional().nullable(),
  is_available: z.boolean().optional(),
});

// Used by PUT /api/products/:id/variants — replace all variants
export const updateVariantsSchema = z.object({
  variants: z
    .array(variantEntrySchema)
    .min(1, "At least one variant is required"),
});

// ── Param Schemas ─────────────────────────────────

// Used by GET/PATCH/DELETE /api/products/:id
export const productIdParamSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
});

// Used by POST /api/products/:id/variants/:variantId/activate|deactivate
export const variantIdParamSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
  variantId: z.string().regex(/^\d+$/, "Invalid variant ID"),
});

// ── Query Schemas ─────────────────────────────────

// Used by GET /api/products — query params for pagination, search, filter, sort
export const getProductsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .optional()
    .default("50"),
  search: z.string().optional(),
  status: z.enum(["all", "active", "unavailable"]).optional().default("all"),
  category: z
    .string()
    .regex(/^\d+$/, "Category must be a positive integer")
    .optional(),
  sortBy: z
    .enum(["product_name", "category_name", "created_at"])
    .optional()
    .default("created_at"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});
