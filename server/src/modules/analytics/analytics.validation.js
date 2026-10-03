import { z } from "zod";
import { pageQuery, limitQuery, searchQuery, categoryQuery, calendarDate, withDateRange } from "../../utils/validation.js";

/**
 * Analytics Validation Schemas
 */
export const getAnalyticsQuerySchema = withDateRange(z.object({
  date_from: calendarDate.optional(),
  date_to: calendarDate.optional(),
}));

export const EXPORT_TYPES = ["all", "financial", "kpi", "orders", "variants", "ingredients", "trend", "waste"];

export const getExportQuerySchema = withDateRange(z.object({
  date_from: calendarDate.optional(),
  date_to: calendarDate.optional(),
  format: z.enum(["excel", "pdf"]).optional().default("excel"),
  type: z
    .string().max(200)
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
}));

export const getTrendQuerySchema = withDateRange(z.object({
  date_from: calendarDate.optional(),
  date_to: calendarDate.optional(),
  granularity: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
}));

export const getVariantProfitQuerySchema = withDateRange(z.object({
  date_from: calendarDate.optional(),
  date_to: calendarDate.optional(),
  search: searchQuery,
  limit: limitQuery("10"),
  page: pageQuery,
  // Category filter speaks the Products dialect: "sub:<id>" (dropdown lists
  // subcategories only) or "root:<id>" fallback — same regex as products.
  category: categoryQuery
    .optional(),
  sort: z.enum(["profit_desc", "profit_asc", "margin_desc", "margin_asc", "units_desc", "net_sales_desc"]).optional().default("profit_desc"),
  // Margin band (%): low <20 at-risk, mid 20–90, high ≥90 stellar.
  margin_band: z.enum(["all", "low", "mid", "high"]).optional().default("all"),
}));

export const getIngredientProfitQuerySchema = withDateRange(z.object({
  date_from: calendarDate.optional(),
  date_to: calendarDate.optional(),
  search: searchQuery,
  limit: limitQuery("20"),
  page: pageQuery,
  sort: z.enum(["stock_value_desc", "stock_value_asc", "total_spend_desc", "total_waste_desc", "restock_count_desc", "name_asc"]).optional().default("stock_value_desc"),
  // Waste presence: with = wasted in range, without = clean rows.
  waste: z.enum(["all", "with", "without"]).optional().default("all"),
  unit: z.string().trim().max(50).optional(),
}));

export const getWasteDetailsQuerySchema = withDateRange(z.object({
  date_from: calendarDate.optional(),
  date_to: calendarDate.optional(),
  type: z.enum(["all", "spoilage", "spillage", "expiry", "cancellation", "other"]).optional().default("all"),
  search: searchQuery,
  limit: limitQuery("20"),
  page: pageQuery,
}));
