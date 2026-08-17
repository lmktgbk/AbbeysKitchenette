import "dotenv/config";

const required = [
  "CLIENT_URL",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "DATABASE_URL",
  "DIRECT_URL",
];

/**
 * Checks if there are missing required variables
 * If one missing, stop immediately
 */
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required variables ${key}`);
  }
}

// export to avoid process.env syntax in the whole app
export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT),
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,

  // Email — SMTP config (optional — falls back to console log in dev)
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  GMAIL_USER: process.env.GMAIL_USER,
  GMAIL_APP_PASS: process.env.GMAIL_APP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM || "Abbey's Kitchenette",
};
