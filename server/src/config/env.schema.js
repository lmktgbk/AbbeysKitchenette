import { z } from "zod/v4";

/**
 * Environment validation — fail fast with an actionable message instead of
 * crashing obscurely later (e.g. listen(NaN) on missing PORT).
 */
const optional = schema => z.preprocess(value => value === "" ? undefined : value, schema.optional());
const origin = z.url().refine(value => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}, "Must be an HTTP(S) origin without a path or credentials").transform(value => new URL(value).origin);
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_URL: origin,
  API_PUBLIC_URL: optional(origin),
  TRUST_PROXY_HOPS: optional(z.coerce.number().int().min(0).max(3)),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("strict"),
  RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).optional(),
  GENERAL_RATE_LIMIT_MAX: z.coerce.number().int().min(100).max(100000).default(500),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().min(1),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_URL: z.string().min(1).refine(
    (v) => /^postgres(ql)?:\/\//.test(v),
    "DATABASE_URL must be a postgres connection string",
  ),
  DIRECT_URL: z.string().min(1),
  FORECAST_URL: z.url().default("http://127.0.0.1:8000").refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
    } catch { return false; }
  }, "FORECAST_URL must be an HTTP(S) origin without credentials"),
  ML_SERVICE_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^[a-f0-9]{64}$/i).optional()),
  ML_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(120000).default(10000),

  // Email — SMTP config (optional — falls back to console log in dev)
  SMTP_HOST: optional(z.string()),
  SMTP_PORT: optional(z.coerce.number().int().min(1).max(65535)),
  SMTP_SECURE: optional(z.enum(["true", "false"])),
  SMTP_USER: optional(z.string()),
  SMTP_PASS: optional(z.string()),
  GMAIL_USER: optional(z.string()),
  GMAIL_APP_PASS: optional(z.string()),
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

  // Realtime (WebSocket heartbeat: server pings, drops silent sockets)
  WS_HEARTBEAT_MS: z.coerce.number().int().positive().default(25000),
  WS_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(10000).default(256),
  WS_MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(1000).default(40),
  WS_MAX_SUBSCRIPTIONS: z.coerce.number().int().min(1).max(100).default(16),
  WS_MAX_PAYLOAD_BYTES: z.coerce.number().int().min(256).max(65536).default(8192),
  WS_MAX_BUFFERED_BYTES: z.coerce.number().int().min(1024).max(1048576).default(65536),
  WS_MAX_MESSAGES_PER_10S: z.coerce.number().int().min(5).max(1000).default(40),
  WS_AUTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),

  // Google Sheets live order sync (optional — disabled unless ALL three set).
  // Private key uses literal \n newlines in .env (converted at use time).
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  SHEETS_ORDERS_ID: z.string().optional(),
}).superRefine((config, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: "custom", path: [path], message });
  if (config.COOKIE_SAME_SITE === "none" && config.NODE_ENV !== "production") {
    issue("COOKIE_SAME_SITE", "Cross-site cookies require the production HTTPS configuration");
  }
  if (config.NODE_ENV !== "production") return;
  for (const field of ["CLIENT_URL", "API_PUBLIC_URL"]) {
    if (!config[field] || !URL.canParse(config[field]) || new URL(config[field]).protocol !== "https:") issue(field, "Production requires an explicit HTTPS origin");
  }
  if (config.TRUST_PROXY_HOPS === undefined) issue("TRUST_PROXY_HOPS", "Set the verified proxy hop count explicitly in production");
  if (config.RATE_LIMIT_STORE === "memory") issue("RATE_LIMIT_STORE", "Production uses shared PostgreSQL rate-limit counters");
  if (/change[-_ ]?me|placeholder|example/i.test(config.JWT_SECRET)) issue("JWT_SECRET", "Replace the example secret before deployment");
  for (const field of ["DATABASE_URL", "DIRECT_URL"]) {
    try {
      const url = new URL(config[field]);
      if (!["postgres:", "postgresql:"].includes(url.protocol) || url.searchParams.get("sslmode") !== "verify-full") {
        issue(field, "Production PostgreSQL connections require sslmode=verify-full");
      }
    } catch { issue(field, "Invalid PostgreSQL connection URL"); }
  }
  const smtp = Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
  const gmail = Boolean(config.GMAIL_USER && config.GMAIL_APP_PASS);
  if (!smtp && !gmail) issue("SMTP_HOST", "Production requires a real SMTP or Gmail transport");
  if (config.SMTP_HOST && !smtp) issue("SMTP_HOST", "Complete the SMTP credentials");
  if (!z.email().safeParse(config.EMAIL_FROM).success) issue("EMAIL_FROM", "Production EMAIL_FROM must be a sender email address");
  for (const fields of [["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"], ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "SHEETS_ORDERS_ID"]]) {
    if (fields.some(field => config[field]) && fields.some(field => !config[field])) issue(fields[0], "Complete all credentials for the enabled integration");
  }
});

export function parseEnvironment(input) {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return { ...parsed.data, TRUST_PROXY_HOPS: parsed.data.TRUST_PROXY_HOPS ?? 0,
    RATE_LIMIT_STORE: parsed.data.RATE_LIMIT_STORE ?? (parsed.data.NODE_ENV === "production" ? "postgres" : "memory") };
}
