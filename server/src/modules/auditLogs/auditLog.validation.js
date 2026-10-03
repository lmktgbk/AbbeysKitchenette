import { z } from "zod";
import { pageQuery, limitQuery, calendarDate, searchQuery, withDateRange } from "../../utils/validation.js";

export const auditLogQuerySchema = withDateRange(z.object({
  page: pageQuery, limit: limitQuery(), userId: z.string().uuid().optional(),
  action: z.string().max(100).optional(), actions: z.string().max(1000).optional(),
  targetType: z.string().max(100).optional(), search: searchQuery,
  startDate: calendarDate.optional(), endDate: calendarDate.optional(),
}), "startDate", "endDate");
