import { z } from "zod";
import { calendarDate, withDateRange } from "../../utils/validation.js";

export const dashboardQuerySchema = withDateRange(z.object({
  dateFrom: calendarDate.optional(), dateTo: calendarDate.optional(),
  granularity: z.enum(["daily", "weekly", "monthly"]).optional().default("daily"),
}), "dateFrom", "dateTo");
