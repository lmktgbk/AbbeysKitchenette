import { z } from "zod";

/**
 * Shift Validation Schemas (BR-02)
 *
 * Cashier drawer sessions with required opening cash.
 */

// POST /api/shifts/open
export const openShiftSchema = z.object({
  opening_cash: z
    .number({ errorMap: () => ({ message: "Opening cash is required" }) })
    .min(0, "Opening cash must be non-negative"),
});

// POST /api/shifts/:id/close
export const closeShiftSchema = z.object({
  actual_cash: z
    .number({ errorMap: () => ({ message: "Actual cash count is required" }) })
    .min(0, "Actual cash must be non-negative"),
  close_note: z
    .string()
    .trim()
    .max(500, "Note must not exceed 500 characters")
    .optional(),
});

// POST /api/shifts/:id/force-close (admin, note always required)
export const forceCloseShiftSchema = z.object({
  actual_cash: z
    .number({ errorMap: () => ({ message: "Actual cash count is required" }) })
    .min(0, "Actual cash must be non-negative"),
  close_note: z
    .string()
    .trim()
    .min(1, "A note is required for force-close")
    .max(500, "Note must not exceed 500 characters"),
});

// ── Param Schemas ───────────────────────────────────────

export const shiftIdParamSchema = z.object({
  id: z.string().uuid("Invalid shift ID"),
});

// GET /api/shifts/:id/orders — windowed list with status filter
export const getShiftOrdersQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .optional()
    .default("15"),
  status: z
    .enum(["all", "accepted", "preparing", "completed", "cancelled"])
    .optional()
    .default("all"),
});

// ── Query Schemas ───────────────────────────────────────

// GET /api/shifts/stats — optional YYYY-MM-DD range (default: today)
export const getShiftStatsQuerySchema = z.object({
  date_from: z.string().optional(), // YYYY-MM-DD
  date_to: z.string().optional(), // YYYY-MM-DD
});

// GET /api/shifts — admin list with filters
export const getShiftsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .optional()
    .default("20"),
  status: z.enum(["all", "open", "closed"]).optional().default("all"),
  staff_id: z.string().uuid("Invalid staff ID").optional(),
  date_from: z.string().optional(), // YYYY-MM-DD
  date_to: z.string().optional(), // YYYY-MM-DD
});
