import { z } from "zod";
import { calendarDate, withDateRange } from "../../utils/validation.js";

// All dashboard date-based reads consume the same validated range; omitted
// granularity defaults to daily before controller destructuring.
export const dashboardQuerySchema = withDateRange(z.object({
  dateFrom: calendarDate.optional(), dateTo: calendarDate.optional(),
  granularity: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
}), "dateFrom", "dateTo");
