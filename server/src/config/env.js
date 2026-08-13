import "dotenv/config";

const required = [
  "CLIENT_URL",
  "JWT_SECRET",
  "JWT_EXPIRES_IN",
  "DATABASE_URL",
  "DIRECT_URL",
  "SMTP_EMAIL",
  "SMTP_PASSWORD",
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
  SMTP_EMAIL: process.env.SMTP_EMAIL,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
};
