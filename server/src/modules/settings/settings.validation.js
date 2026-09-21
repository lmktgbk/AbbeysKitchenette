import { z } from "zod";

const TIME_RE = /^\d{2}:\d{2}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const dayScheduleSchema = z
  .object({
    enabled: z.boolean(),
    open: z.string().regex(TIME_RE, "Time must be HH:MM format"),
    close: z.string().regex(TIME_RE, "Time must be HH:MM format"),
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

const automationJobSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "weekly"]),
    time: z.string().regex(TIME_RE, "Time must be HH:MM format"),
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
  storeEmail: z.string().trim().email("Invalid email format").optional(),
  storeHours: storeHoursSchema.optional(),
  storeIpWhitelist: ipWhitelistSchema,
  // At least one payment method must stay enabled.
  acceptedPayments: z.array(paymentMethodSchema).min(1, "At least one payment method is required").optional(),
  automation: automationSchema.optional(),
});
