import { z } from "zod/v4";

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  // Comma-separated list (e.g. order_new,order_completed,order_accepted,
  // order_cancelled = 56 chars) — must fit the longest group-chip CSV.
  type: z.string().max(200).optional(),
});

export const cleanupSchema = z.object({
  days: z.coerce.number().int().positive().default(30),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid("Invalid notification ID"),
});
