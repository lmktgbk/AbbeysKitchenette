import { z } from "zod/v4";

export const forecastJobQuerySchema = z.object({
  jobId: z.coerce.number().int().positive(),
});
