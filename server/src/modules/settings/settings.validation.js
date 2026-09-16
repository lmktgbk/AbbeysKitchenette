import { z } from "zod";

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  open: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format"),
  close: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format"),
});

const storeHoursSchema = z.object({
  monday: dayScheduleSchema,
  tuesday: dayScheduleSchema,
  wednesday: dayScheduleSchema,
  thursday: dayScheduleSchema,
  friday: dayScheduleSchema,
  saturday: dayScheduleSchema,
  sunday: dayScheduleSchema,
});

// Used by PATCH /api/settings — all fields optional
export const updateSettingsSchema = z.object({
  storeName: z.string().min(1, "Store name is required").max(200).optional(),
  storeAddress: z.string().max(500).optional(),
  storePhone: z.string().max(20).optional(),
  storeEmail: z.string().email("Invalid email format").optional(),
  storeHours: storeHoursSchema.optional(),
  comboDiscountPercent: z.number().min(0).max(100).optional(),
  minMarginPercent: z.number().min(0).max(100).optional(),
  storeIpWhitelist: z.string().max(500).optional(),
  notifyDailyReport: z.boolean().optional(),
});
