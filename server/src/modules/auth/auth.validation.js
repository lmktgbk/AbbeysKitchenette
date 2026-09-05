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
  email: z.string().email("Invalid email format").min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

// Used by POST /auth/login-pin — PIN login for cashier/kitchen (store IP only)
export const loginPinSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
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

// Used by POST /auth/forgot-password — admin requests password reset link
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format").min(1, "Email is required"),
});

// Used by POST /auth/reset-password — reset password from email link (token in URL)
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
});

// Used by POST /auth/change-pin — staff changes own PIN after mustChangePwd
export const changePinSchema = z.object({
  newPin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});

// Used by PATCH /auth/me — update own profile
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
  email: z.string().email("Invalid email format"),
});

// Used by POST /auth/change-password — change own password
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .max(128, "New password must not exceed 128 characters"),
});
