import { z } from "zod";

// Used by ProfileForm — name + email
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must not exceed 100 characters"),
  email: z.string().email("Invalid email format"),
});

// Used by ChangePasswordForm — current + new + confirm
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128, "New password must not exceed 128 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
