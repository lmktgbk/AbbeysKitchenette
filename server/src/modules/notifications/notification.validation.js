import { z } from "zod";
import { LIMITS, coercedInteger } from "../../utils/validation.js";

export const notificationQuerySchema = z.object({
  page: coercedInteger(LIMITS.page).optional().default(1),
  limit: coercedInteger(LIMITS.pageSize).optional().default(20),
  // Comma-separated list (e.g. order_new,order_completed,order_accepted,
  // order_cancelled = 56 chars) — must fit the longest group-chip CSV.
  type: z.string().max(200).optional(),
});

export const cleanupSchema = z.object({
  days: coercedInteger(3650).optional().default(30),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});
