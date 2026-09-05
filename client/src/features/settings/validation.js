import { z } from "zod";

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  open: z.string(),
  close: z.string(),
});

export const generalSchema = z.object({
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
});

export const businessSchema = z.object({
  taxRate: z.coerce
    .number()
    .min(0, "Tax rate must be at least 0")
    .max(100, "Tax rate must not exceed 100"),
  comboDiscountPercent: z.coerce
    .number()
    .min(0, "Discount must be at least 0")
    .max(100, "Discount must not exceed 100"),
  minMarginPercent: z.coerce
    .number()
    .min(0, "Margin must be at least 0")
    .max(100, "Margin must not exceed 100"),
});

export const securitySchema = z.object({
  storeIpWhitelist: z.string().max(500).optional().or(z.literal("")),
});

export const notificationsSchema = z.object({
  notifyLowStock: z.boolean(),
  notifyNewOrders: z.boolean(),
  notifyDailyReport: z.boolean(),
});
