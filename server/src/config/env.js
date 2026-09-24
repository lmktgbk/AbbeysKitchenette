import "dotenv/config";
import { z } from "zod/v4";

/**
 * Environment validation — fail fast with an actionable message instead of
 * crashing obscurely later (e.g. listen(NaN) on missing PORT).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().min(1),
  DATABASE_URL: z.string().min(1).refine(
    (v) => v.startsWith("postgresql://") || v.startsWith("prisma+postgres://"),
    "DATABASE_URL must be a postgres connection string",
  ),
  DIRECT_URL: z.string().min(1),

  // Email — SMTP config (optional — falls back to console log in dev)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("Abbey's Kitchenette"),

  // Cloudinary — image storage
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Gemini AI
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // Anomaly Detection
  ANOMALY_CRON_SCHEDULE: z.string().default("0 6 * * *"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment: ${details}`);
}

// export to avoid process.env syntax in the whole app
export const env = parsed.data;
