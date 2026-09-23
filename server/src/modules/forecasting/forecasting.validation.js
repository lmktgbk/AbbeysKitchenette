import { z } from "zod/v4";

// Python expects integer job ids (FastAPI: job_id: int) — coerce and bound
// here so path confusion like ../../etc never reaches the proxy fetch.
export const forecastJobQuerySchema = z.object({
  jobId: z.coerce.number().int().positive(),
});
