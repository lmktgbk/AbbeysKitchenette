import { z } from "zod";
import { coercedInteger } from "../../utils/validation.js";

// Python expects integer job ids (FastAPI: job_id: int) — coerce and bound
// here so path confusion like ../../etc never reaches the proxy fetch.
export const forecastJobQuerySchema = z.object({
  jobId: coercedInteger(),
});
