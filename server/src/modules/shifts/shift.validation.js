import { z } from "zod";

export const startShiftSchema = z.object({
  opening_cash: z.number().min(0, "Opening cash must be non-negative"),
  notes: z.string().max(500).optional(),
});

export const endShiftSchema = z.object({
  actual_cash: z.number().min(0, "Actual cash must be non-negative"),
  notes: z.string().max(500).optional(),
});

export const shiftIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, "Shift ID must be a number"),
});

export const getShiftsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  staff_id: z.string().uuid().optional(),
  status: z.enum(["active", "closed"]).optional(),
});
