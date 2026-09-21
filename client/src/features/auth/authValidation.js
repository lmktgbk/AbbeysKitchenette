import { z } from "zod";

// Used by LoginPage — email + password login
export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

// Used by ForgotPasswordPage — send reset link
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email"),
});

// Used by ResetPasswordPage — new password + confirm
export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// Used by OtpForm — 6-digit OTP
export const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

// Used by ChangePasswordPage — first login / forced change (authenticated)
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
