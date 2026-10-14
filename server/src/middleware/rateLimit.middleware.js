import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import { sharedRateLimitStore } from "../infrastructure/rateLimit/rateLimit.store.js";
import { SECURITY_POLICY } from "../config/securityPolicy.js";
import { env } from "../config/env.js";

/** Report the existing window's deadline; rejected requests do not extend it. */
function rateLimitResponse(req, res, message, code) {
  const retryAfterSeconds = Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000));
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ success: false, message, error: code, data: { retryAfterSeconds } });
}

// Authenticated identity prevents rotating IPs from bypassing this outer budget.
// Durable password/code counters and issuance cooldowns remain the cross-instance backstop.
export const emailChangeLimiter = rateLimit({
  store: sharedRateLimitStore("emailChange"),
  windowMs: SECURITY_POLICY.windowMs,
  max: SECURITY_POLICY.emailChange,
  keyGenerator: req => `email-change:${req.user.id}`,
  skip: req => req.method === "PATCH" && req.body?.email === req.user.email,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitResponse(req, res, "Too many email verification attempts. Please wait before trying again.", "EMAIL_CHANGE_RATE_LIMIT"),
});

/**
 * Rate Limiters
 *
 * Each limiter protects a specific type of endpoint:
 *
 * generalLimiter    → all routes (DDoS protection)
 * authLimiter       → login endpoints (brute force prevention)
 * accountLimiter    → per-user login attempts (distributed attack prevention)
 * guestOrderLimiter → public checkout (order spam prevention)
 * guestTrackLimiter → public order tracking (poll-friendly)
 *
 * Standard headers enabled (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
 * so clients know their remaining quota.
 */

/**
 * Global rate limiter: 3000 requests per 5 min per IP.
 * Applied to all routes via app.use().
 */
export const generalLimiter = rateLimit({
  store: sharedRateLimitStore("general"),
  windowMs: SECURITY_POLICY.windowMs,
  max: env.GENERAL_RATE_LIMIT_MAX ?? SECURITY_POLICY.general,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitResponse(req, res, "Too many requests from this network. Please wait before trying again.", "RATE_LIMIT_EXCEEDED"),
});

/**
 * Auth rate limiter: 100 requests per 5 min per IP.
 * Shared by password login, OTP verification/resend and password recovery routes.
 * Prevents brute-force attacks from a single IP.
 */
export const authLimiter = rateLimit({
  store: sharedRateLimitStore("auth"),
  windowMs: SECURITY_POLICY.windowMs,
  max: SECURITY_POLICY.authentication,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  // Include timing in JSON: cross-origin browsers cannot always read Retry-After.
  // Use the limiter's actual reset, not a fresh five-minute delay per rejection.
  handler: (req, res) => {
    return rateLimitResponse(req, res, "Too many authentication requests from this network. Please wait before trying again.", "AUTH_RATE_LIMIT_EXCEEDED");
  },
});

/** Independent action budgets prevent password recovery from consuming OTP
 * verification capacity. Durable account/challenge counters remain authoritative.
 */
function actionLimiter(namespace, max, label, keyGenerator) {
  return rateLimit({
    store: sharedRateLimitStore(namespace), windowMs: SECURITY_POLICY.windowMs, max,
    keyGenerator: keyGenerator ?? (req => ipKeyGenerator(req.ip ?? "unknown")),
    standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => {
      return rateLimitResponse(req, res, `Too many ${label}. Please wait before trying again.`, `${namespace.toUpperCase()}_RATE_LIMIT_EXCEEDED`);
    },
  });
}

/** Hash normalized emails so case changes cannot evade shared account budgets. */
function accountKey(req) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
  return email ? createHash("sha256").update(email).digest("hex") : ipKeyGenerator(req.ip ?? "unknown");
}
export const loginLimiter = actionLimiter("login", SECURITY_POLICY.login, "sign-in requests from this network");
export const otpVerifyLimiter = actionLimiter("otp_verify", SECURITY_POLICY.otpVerify, "code verification requests from this network");
export const otpResendLimiter = actionLimiter("otp_resend", SECURITY_POLICY.otpResend, "code resend requests from this network");
export const recoveryLimiter = actionLimiter("recovery", SECURITY_POLICY.recovery, "password recovery requests from this network");
export const resetLimiter = actionLimiter("password_reset", SECURITY_POLICY.passwordReset, "password reset requests from this network");
// Count every recovery response: unknown-account responses deliberately look successful.
export const recoveryAccountLimiter = actionLimiter("recovery_account", SECURITY_POLICY.recoveryAccount, "password recovery requests for this account", accountKey);

/**
 * Account-specific limiter: five credential failures per five minutes per email.
 * Key is generated from req.body.email, not IP.
 *
 * Why? A brute-force attacker could use 100 different IPs
 * to try different passwords on the same account.
 * Per-IP limiter can't catch this. Per-email limiter can.
 *
 * skipSuccessfulRequests: true — successful login doesn't count toward limit.
 * This means a legitimate user who mistypes once won't be blocked.
 */
export const accountLimiter = rateLimit({
  store: sharedRateLimitStore("account"),
  windowMs: SECURITY_POLICY.windowMs,
  max: SECURITY_POLICY.accountFailures,
  keyGenerator: accountKey,
  skipSuccessfulRequests: true,
  // Only incorrect credentials spend this password budget. Already-locked
  // requests must not start another account budget while the lockout expires.
  // Store-policy rejection and email outages have independent budgets and must not
  // lock an otherwise correct account before OTP issuance.
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitResponse(req, res, "Too many sign-in attempts for this account. Please wait before trying again.", "ACCOUNT_RATE_LIMIT_EXCEEDED"),
});

/**
 * Guest order limiter: 100 submissions per five minutes per IP.
 * Public checkout has its own stricter submission budget.
 */
export const guestOrderLimiter = rateLimit({
  store: sharedRateLimitStore("guestOrder"),
  windowMs: SECURITY_POLICY.windowMs,
  max: SECURITY_POLICY.guestOrder,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitResponse(req, res, "Too many order submissions from this network. Please wait before trying again.", "GUEST_ORDER_RATE_LIMIT_EXCEEDED"),
});

/**
 * Guest tracking limiter: 600 reads per five minutes per IP.
 * Shared capacity supports multiple tracking pages on the store network.
 */
export const guestTrackLimiter = rateLimit({
  store: sharedRateLimitStore("guestTrack"),
  windowMs: SECURITY_POLICY.windowMs,
  max: SECURITY_POLICY.guestTrack,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => rateLimitResponse(req, res, "Too many tracking requests from this network. Please wait before trying again.", "RATE_LIMIT_EXCEEDED"),
});
