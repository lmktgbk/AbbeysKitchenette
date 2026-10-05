import { z } from "zod";

/**
 * Product Validation Schemas
 *
 * Used by react-hook-form with ZodResolver.
 * Separate schemas for create vs edit modes.
 */

// Blank/NaN numeric form fields become zero; positive price/recipe constraints then reject them.
const coerceNumber = (schema) => z.preprocess(
  (v) => (v === "" || v === undefined || v === null || (typeof v === "number" && isNaN(v)) ? 0 : Number(v)),
  schema,
);

// ── Nested Schemas ────────────────────────────────

const recipeEntrySchema = z.object({
  ingredient_id: z.string().uuid("Select an ingredient"),
  quantity_needed: coerceNumber(z.number().positive("Quantity must be greater than zero")),
});

const variantEntrySchema = z.object({
  variant_id: z.number().int().positive().optional(),
  size_name: z
    .string()
    .min(1, "Size name is required")
    .max(50, "Must not exceed 50 characters"),
  price: coerceNumber(z.number().positive("Price must be greater than zero")),
  is_available: z.boolean().optional().default(true),
  recipes: z
    .array(recipeEntrySchema)
    .min(1, "At least one ingredient is required"),
});

// ── Product Schemas ───────────────────────────────

// Creation requires name, category, and variants; description/image are optional and availability defaults true.
export const createProductSchema = z.object({
  product_name: z
    .string()
    .min(1, "Product name is required")
    .max(150, "Must not exceed 150 characters"),
  subcategory_id: z.number({ required_error: "Category is required" }),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
  image_url: z.string().optional().or(z.literal("")),
  is_available: z.boolean().optional().default(true),
  variants: z
    .array(variantEntrySchema)
    .min(1, "At least one variant is required"),
});

// Editing allows omitted metadata but still requires variants. Null image_url explicitly requests removal.
export const editProductSchema = z.object({
  product_name: z
    .string()
    .min(1, "Product name is required")
    .max(150, "Must not exceed 150 characters")
    .optional(),
  subcategory_id: z.number().optional(),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
  image_url: z.string().optional().or(z.literal("")).nullable(),
  is_available: z.boolean().optional(),
  variants: z
    .array(variantEntrySchema)
    .min(1, "At least one variant is required"),
});

// ── Category Schemas ─────────────────────────────

export const createCategorySchema = z.object({
  subcategory_name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Must not exceed 100 characters"),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
});

export const editCategorySchema = z.object({
  subcategory_name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Must not exceed 100 characters")
    .optional(),
  description: z
    .string()
    .max(500, "Must not exceed 500 characters")
    .optional()
    .or(z.literal("")),
});

// Browser preflight mirrors the product upload policy. It improves feedback;
// only the backend can establish that the file bytes are a valid, safe image.
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const productImageTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
export const PRODUCT_IMAGE_ACCEPT = Object.keys(productImageTypes).join(",");

/** Reject obvious type/size errors before replacing the user's current image draft. */
export function productImageError(file) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!Object.hasOwn(productImageTypes, extension) || file.type !== productImageTypes[extension]) {
    return "Choose a JPG, PNG, WebP or GIF image.";
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return "Image must be 5 MB or smaller.";
  if (file.size === 0) return "The selected image is empty. Choose another file.";
  return "";
}
