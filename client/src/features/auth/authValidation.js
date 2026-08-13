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

// Used by ChangePinPage — new PIN + confirm
export const changePinSchema = z
  .object({
    newPin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
    confirmPin: z.string(),
  })
  .refine((data) => data.newPin === data.confirmPin, {
    message: "PINs don't match",
    path: ["confirmPin"],
  });

// Used by OtpForm — 6-digit OTP
export const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});
