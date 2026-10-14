import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import { sharedRateLimitStore } from "../infrastructure/rateLimit/rateLimit.store.js";
import { env } from "../config/env.js";

/** Report the existing window's deadline; rejected requests do not extend it. */
function authLimitResponse(req, res, message, code) {
  const retryAfterSeconds = Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000));
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ success: false, message, error: code, data: { retryAfterSeconds } });
}

// Authenticated identity prevents rotating IPs from bypassing this outer budget.
// Durable password/code counters and issuance cooldowns remain the cross-instance backstop.
export const emailChangeLimiter = rateLimit({
  store: sharedRateLimitStore("emailChange"),
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: req => `email-change:${req.user.id}`,
  skip: req => req.method === "PATCH" && req.body?.email === req.user.email,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many email verification attempts; try again later",
    error: "EMAIL_CHANGE_RATE_LIMIT", data: null },
});

/**
 * Rate Limiters
 *
 * Each limiter protects a specific type of endpoint:
 *
 * generalLimiter    → all routes (DDoS protection)
 * authLimiter       → login endpoints (brute force prevention)
 * accountLimiter    → per-user login attempts (distributed attack prevention)
 * liberalLimiter    → dashboard polling (higher limit for real-time data)
 * guestOrderLimiter → public checkout (order spam prevention)
 * guestTrackLimiter → public order tracking (poll-friendly)
 *
 * Standard headers enabled (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
 * so clients know their remaining quota.
 */

/**
 * Global rate limiter: 500 requests per 15 min per IP.
 * Applied to all routes via app.use().
 */
export const generalLimiter = rateLimit({
  store: sharedRateLimitStore("general"),
  windowMs: 15 * 60 * 1000,
  max: env.GENERAL_RATE_LIMIT_MAX ?? 500,
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
 * Auth rate limiter: 100 requests per 15 min per IP.
 * Shared by password login, OTP verification/resend and password recovery routes.
 * Prevents brute-force attacks from a single IP.
 */
export const authLimiter = rateLimit({
  store: sharedRateLimitStore("auth"),
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  // Include timing in JSON: cross-origin browsers cannot always read Retry-After.
  // Use the limiter's actual reset, not a fresh fifteen-minute delay per rejection.
  handler: (req, res) => {
    return authLimitResponse(req, res, "Too many authentication requests from this network. Please wait before trying again.", "AUTH_RATE_LIMIT_EXCEEDED");
  },
});

/** Independent action budgets prevent password recovery from consuming OTP
 * verification capacity. Durable account/challenge counters remain authoritative.
 */
function actionLimiter(namespace, max, label, keyGenerator) {
  return rateLimit({
    store: sharedRateLimitStore(namespace), windowMs: 15 * 60 * 1000, max,
    keyGenerator: keyGenerator ?? (req => ipKeyGenerator(req.ip ?? "unknown")),
    standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => {
      return authLimitResponse(req, res, `Too many ${label}. Please wait before trying again.`, `${namespace.toUpperCase()}_RATE_LIMIT_EXCEEDED`);
    },
  });
}

/** Hash normalized emails so case changes cannot evade shared account budgets. */
function accountKey(req) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
  return email ? createHash("sha256").update(email).digest("hex") : ipKeyGenerator(req.ip ?? "unknown");
}
export const loginLimiter = actionLimiter("login", 40, "sign-in requests from this network");
export const otpVerifyLimiter = actionLimiter("otp_verify", 40, "code verification requests from this network");
export const otpResendLimiter = actionLimiter("otp_resend", 20, "code resend requests from this network");
export const recoveryLimiter = actionLimiter("recovery", 20, "password recovery requests from this network");
export const resetLimiter = actionLimiter("password_reset", 20, "password reset requests from this network");
// Count every recovery response: unknown-account responses deliberately look successful.
export const recoveryAccountLimiter = actionLimiter("recovery_account", 5, "password recovery requests for this account", accountKey);

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
  store: sharedRateLimitStore("account"),
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: accountKey,
  skipSuccessfulRequests: true,
  // Only credential failures/lockouts spend this password budget. Store-policy
  // rejection and email outages have independent network budgets and must not
  // lock an otherwise correct account before OTP issuance.
  requestWasSuccessful: (_req, res) => ![401, 423].includes(res.statusCode),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => authLimitResponse(req, res, "Too many sign-in attempts for this account. Please wait before trying again.", "ACCOUNT_RATE_LIMIT_EXCEEDED"),
});

/**
 * Liberal limiter: 3000 requests per 15 min per IP.
 * For dashboard routes that get polled every 15-30 seconds.
 * Admin viewing orders, notifications, forecasts, etc.
 */
export const liberalLimiter = rateLimit({
  store: sharedRateLimitStore("liberal"),
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

/**
 * Guest order limiter: 10 orders per 15 min per IP.
 * Public checkout is the easiest spam target — mirrors authLimiter.
 */
export const guestOrderLimiter = rateLimit({
  store: sharedRateLimitStore("guestOrder"),
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many orders, please try again in 15 minutes",
    error: "GUEST_ORDER_RATE_LIMIT_EXCEEDED",
    data: null,
  },
});

/**
 * Guest tracking limiter: 120 views per 15 min per IP.
 * Generous on purpose — one tracking page polling every 15s uses ~60
 * per window, with headroom for families sharing store WiFi.
 */
export const guestTrackLimiter = rateLimit({
  store: sharedRateLimitStore("guestTrack"),
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
    error: "RATE_LIMIT_EXCEEDED",
    data: null,
  },
});
