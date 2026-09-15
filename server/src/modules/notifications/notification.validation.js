import { z } from "zod/v4";

export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const cleanupSchema = z.object({
  days: z.coerce.number().int().positive().default(30),
});
