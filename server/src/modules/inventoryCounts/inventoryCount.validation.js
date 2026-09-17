import { z } from "zod";

export const startCountSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const submitCountSchema = z.object({
  items: z.array(z.object({
    ingredient_id: z.string().uuid("Invalid ingredient ID"),
    actual_quantity: z.number().min(0, "Actual quantity must be non-negative"),
    notes: z.string().max(500).optional(),
  })).min(1, "At least one item is required"),
});

export const countIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Count ID must be a number"),
});

export const getCountsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
  status: z.enum(["in_progress", "completed"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
