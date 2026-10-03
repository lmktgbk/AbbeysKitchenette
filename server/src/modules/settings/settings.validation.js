import { z } from "zod";

import { clockTime } from "../../utils/validation.js";
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const dayScheduleSchema = z
  .object({
    enabled: z.boolean(),
    open: clockTime,
    close: clockTime,
  })
  // No overnight shifts: closing must be after opening (same day).
  .refine((d) => !d.enabled || toMinutes(d.close) > toMinutes(d.open), {
    message: "Closing time must be after opening time (overnight shifts unsupported)",
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

const paymentMethodSchema = z.enum(["cash", "gcash", "maya"]);

// Defaults when unset — mirrors seed TABLES (1–8 + Takeout).
export const DEFAULT_DINING_TABLES = {
  tables: Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`,
    label: `Table ${i + 1}`,
    enabled: true,
  })),
  takeoutEnabled: true,
};
const diningTableSchema = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  // Max 20: order table_number contract caps at 20 chars server-side.
  label: z.string().trim().min(1, "Table label is required").max(20),
  enabled: z.boolean(),
});

const diningTablesSchema = z.object({
  tables: z.array(diningTableSchema).max(50).default([]),
  takeoutEnabled: z.boolean().default(true),
});

const automationJobSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "weekly"]),
    time: clockTime,
    // Required when frequency is weekly (which weekday to run).
    day: z
      .enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
      .optional(),
  })
  .refine((j) => j.frequency === "daily" || j.day !== undefined, {
    message: "day is required for weekly schedules",
    path: ["day"],
  });

const automationSchema = z.object({
  forecast: automationJobSchema.optional(),
  reorder: automationJobSchema.optional(),
  waste: automationJobSchema.optional(),
  marketBasket: automationJobSchema.optional(),
  // Daily report email (daily-only in UI; same shape for scheduler reuse).
  dailyReport: automationJobSchema.optional(),
});

const ipWhitelistSchema = z
  .string()
  .max(500)
  .optional()
  .refine(
    (v) => {
      if (v === undefined || v.trim() === "") return true;
      return v
        .split(",")
        .map((ip) => ip.trim())
        .filter(Boolean)
        .every((ip) => IPV4_RE.test(ip));
    },
    { message: "Must be comma-separated IPv4 addresses (e.g. 192.168.1.100, 10.0.0.1)" },
  );

// Used by PATCH /api/settings — all fields optional
export const updateSettingsSchema = z.object({
  storeName: z.string().trim().min(1, "Store name is required").max(200).optional(),
  storeAddress: z.string().trim().max(500).optional(),
  storePhone: z.string().trim().max(20).optional(),
  storeEmail: z.string().trim().email("Invalid email format").max(254).optional(),
  storeHours: storeHoursSchema.optional(),
  storeIpWhitelist: ipWhitelistSchema,
  // At least one payment method must stay enabled.
  acceptedPayments: z.array(paymentMethodSchema).min(1, "At least one payment method is required").max(3).optional(),
  automation: automationSchema.optional(),
  diningTables: diningTablesSchema.optional(),
});
