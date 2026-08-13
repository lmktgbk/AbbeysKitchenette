import crypto from "crypto";

/**
 * OTP Utility
 *
 * In-memory (server )OTP store for admin 2FA.
 * OTPs are stored with a 10-minute TTL and auto-expire.
 *
 * Structure:
 *   Map<userId, { code, expiresAt }>
 */

const otpStore = new Map();

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;

/**
 * Generate a 6-digit OTP for a user
 * @param {string} userId - The user ID
 * @returns {string} - The 6-digit OTP code
 */
export function generateOtp(userId) {
  // Generate 6-digit code
  const code = crypto.randomInt(100000, 999999).toString();

  // Store with expiry
  otpStore.set(userId, {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  });

  return code;
}

/**
 * Verify an OTP
 * @param {string} userId - The user ID
 * @param {string} code - The 6-digit code to verify
 * @returns {boolean} - true if valid, false otherwise
 */
export function verifyOtp(userId, code) {
  const stored = otpStore.get(userId);

  if (!stored) return false;

  // Check expiry
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(userId);
    return false;
  }

  // Check code
  if (stored.code !== code) return false;

  // Delete after successful verification
  otpStore.delete(userId);
  return true;
}

/**
 * Delete OTP for a user (used after successful login or resend)
 * @param {string} userId - The user ID
 */
export function deleteOtp(userId) {
  otpStore.delete(userId);
}

/**
 * Check if a valid OTP exists for a user
 * @param {string} userId - The user ID
 * @returns {boolean}
 */
export function hasValidOtp(userId) {
  const stored = otpStore.get(userId);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(userId);
    return false;
  }
  return true;
}
