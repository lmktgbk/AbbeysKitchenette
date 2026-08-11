import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Rate Limiters
 *
 * Each limiter protects a specific type of endpoint:
 *
 * generalLimiter    → all routes (DDoS protection)
 * authLimiter       → login endpoints (brute force prevention)
 * accountLimiter    → per-user login attempts (distributed attack prevention)
 * liberalLimiter    → dashboard polling (higher limit for real-time data)
 *
 * Standard headers enabled (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
 * so clients know their remaining quota.
 */

/**
 * Global rate limiter: 500 requests per 15 min per IP.
 * Applied to all routes via app.use().
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    error: "RATE_LIMIT_EXCEEDED",
    data: null,
  },
});

/**
 * Auth rate limiter: 10 attempts per 15 min per IP.
 * Applied to POST /login and POST /login-pin.
 * Prevents brute-force attacks from a single IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts, please try again in 15 minutes",
    error: "AUTH_RATE_LIMIT_EXCEEDED",
    data: null,
  },
});

/**
 * Account-specific limiter: 10 attempts per 15 min per email.
 * Key is generated from req.body.email, not IP.
 *
 * Why? A brute-force attacker could use 100 different IPs
 * to try 10 passwords each on the same account (1000 total).
 * Per-IP limiter can't catch this. Per-email limiter can.
 *
 * skipSuccessfulRequests: true — successful login doesn't count toward limit.
 * This means a legitimate user who mistypes once won't be blocked.
 */
export const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) =>
    `account:${req.body?.email || ipKeyGenerator(req.ip ?? "unknown")}`,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many attempts for this account, please try again in 15 minutes",
    error: "ACCOUNT_RATE_LIMIT_EXCEEDED",
    data: null,
  },
});

/**
 * Liberal limiter: 3000 requests per 15 min per IP.
 * For dashboard routes that get polled every 15-30 seconds.
 * Admin viewing orders, notifications, forecasts, etc.
 */
export const liberalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    error: "RATE_LIMIT_EXCEEDED",
    data: null,
  },
});
