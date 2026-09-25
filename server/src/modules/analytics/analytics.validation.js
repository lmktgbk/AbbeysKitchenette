import { z } from "zod";

/**
 * Analytics Validation Schemas
 */
export const getAnalyticsQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export const EXPORT_TYPES = ["all", "financial", "kpi", "orders", "variants", "ingredients", "trend", "waste"];

export const getExportQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  format: z.enum(["excel", "pdf"]).optional().default("excel"),
  type: z
    .string()
    .optional()
    .default("all")
    .refine(
      (val) =>
        val
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .every((t) => EXPORT_TYPES.includes(t)),
      { message: `Invalid export type. Allowed: ${["all", "financial", "variants", "ingredients", "waste", "trend"].join(", ")} (comma-separated)` },
    ),
});

export const getTrendQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  granularity: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
});

export const getVariantProfitQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search: z.string().optional(),
  limit: z.string().optional().default("10"),
  page: z.string().optional().default("1"),
  // Category filter speaks the Products dialect: "sub:<id>" (dropdown lists
  // subcategories only) or "root:<id>" fallback — same regex as products.
  category: z
    .string()
    .regex(/^(root|sub):\d+$/, "Category must be root:id or sub:id")
    .optional(),
  sort: z.enum(["profit_desc", "profit_asc", "margin_desc", "margin_asc", "units_desc", "net_sales_desc"]).optional().default("profit_desc"),
  // Margin band (%): low <20 at-risk, mid 20–90, high ≥90 stellar.
  margin_band: z.enum(["all", "low", "mid", "high"]).optional().default("all"),
});

export const getIngredientProfitQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search: z.string().optional(),
  limit: z.string().optional().default("20"),
  page: z.string().optional().default("1"),
  sort: z.enum(["stock_value_desc", "stock_value_asc", "total_spend_desc", "total_waste_desc", "restock_count_desc", "name_asc"]).optional().default("stock_value_desc"),
  // Waste presence: with = wasted in range, without = clean rows.
  waste: z.enum(["all", "with", "without"]).optional().default("all"),
  unit: z.string().trim().max(50).optional(),
});

export const getWasteDetailsQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  type: z.string().optional().default("all"),
  search: z.string().optional(),
  limit: z.string().optional().default("20"),
  page: z.string().optional().default("1"),
});
