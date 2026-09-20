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
});

export const getWasteDetailsQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  type: z.string().optional().default("all"),
  search: z.string().optional(),
  limit: z.string().optional().default("20"),
  page: z.string().optional().default("1"),
});
