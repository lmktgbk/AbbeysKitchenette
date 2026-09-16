import { z } from "zod";

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  open: z.string(),
  close: z.string(),
});

export const settingsSchema = z.object({
  storeName: z.string().min(1, "Store name is required").max(200),
  storeEmail: z.string().email("Invalid email format"),
  storeAddress: z.string().max(500).optional().or(z.literal("")),
  storePhone: z.string().max(20).optional().or(z.literal("")),
  storeHours: z.object({
    monday: dayScheduleSchema,
    tuesday: dayScheduleSchema,
    wednesday: dayScheduleSchema,
    thursday: dayScheduleSchema,
    friday: dayScheduleSchema,
    saturday: dayScheduleSchema,
    sunday: dayScheduleSchema,
  }),
  comboDiscountPercent: z.coerce.number().min(0, "Discount must be at least 0").max(100, "Discount must not exceed 100"),
  minMarginPercent: z.coerce.number().min(0, "Margin must be at least 0").max(100, "Margin must not exceed 100"),
  notifyDailyReport: z.boolean(),
  storeIpWhitelist: z.string().max(500).optional().or(z.literal("")),
});
