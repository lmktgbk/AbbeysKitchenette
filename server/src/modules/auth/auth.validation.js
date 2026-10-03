import { z } from "zod";

/**
 * Auth Validation Schemas
 *
 * These schemas are used by the validate middleware (validate.js)
 * to validate request bodies before the controller runs.
 *
 * If validation fails → error response, controller never executes.
 * If validation passes → req.body is replaced with parsed data.
 */

// Used by POST /auth/login — email + password login for all roles
export const loginSchema = z.object({
  email: z.string().trim().email("Invalid email format").min(1, "Email is required").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

// Used by POST /auth/verify-otp — admin 2FA verification
export const verifyOtpSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  code: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

// Used by POST /auth/resend-otp — resend OTP to admin email
export const resendOtpSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

// Used by POST /auth/forgot-password — any role requests password reset link
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Invalid email format").min(1, "Email is required").max(254),
});

// Used by POST /auth/reset-password — reset password from email link (token in URL)
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required").max(2048),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
});

// Used by PATCH /auth/me — update own profile
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
  email: z.string().trim().email("Invalid email format").max(254),
  currentPassword: z.string().max(128).optional(),
});

// Used by POST /auth/change-password — change own password
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password must not exceed 128 characters"),
});

export const confirmEmailChangeSchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit code"),
});
