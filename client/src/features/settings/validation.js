import { z } from "zod";

const TIME_RE = /^\d{2}:\d{2}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function toMinutes(t) {
  const [h, m] = (t || "").split(":").map(Number);
  return h * 60 + m;
}

const dayScheduleSchema = z
  .object({
    enabled: z.boolean(),
    open: z.string().regex(TIME_RE, "Time must be HH:MM format"),
    close: z.string().regex(TIME_RE, "Time must be HH:MM format"),
  })
  .refine((d) => !d.enabled || toMinutes(d.close) > toMinutes(d.open), {
    message: "Closing must be after opening",
  });

const paymentMethodSchema = z.enum(["cash", "gcash", "maya"]);

const automationJobSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "weekly"]),
    time: z.string().regex(TIME_RE, "Time must be HH:MM format"),
    day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).optional(),
  })
  .refine((j) => j.frequency === "daily" || j.day !== undefined, {
    message: "Pick a weekday for weekly schedules",
    path: ["day"],
  });

const automationSchema = z.object({
  forecast: automationJobSchema.optional(),
  reorder: automationJobSchema.optional(),
  waste: automationJobSchema.optional(),
  marketBasket: automationJobSchema.optional(),
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
  storeIpWhitelist: z
    .string()
    .max(500)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => {
        if (!v || v.trim() === "") return true;
        return v
          .split(",")
          .map((ip) => ip.trim())
          .filter(Boolean)
          .every((ip) => IPV4_RE.test(ip));
      },
      { message: "Must be comma-separated IPv4 addresses" },
    ),
  acceptedPayments: z.array(paymentMethodSchema).min(1, "At least one payment method is required"),
  automation: automationSchema.optional().default({}),
});
