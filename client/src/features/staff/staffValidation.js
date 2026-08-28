import { z } from "zod";

/**
 * Staff Validation Schemas (Client-Side)
 *
 * Used with react-hook-form via @hookform/resolvers/zod.
 */

export const createStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address"),
  role: z.enum(["cashier", "kitchen"], {
    message: "Role is required",
  }),
});

export const editStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters")
    .optional(),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .optional(),
  role: z.enum(["cashier", "kitchen"]).optional(),
});

export const resetPinSchema = z.object({
  new_pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});

export const resetPasswordSchema = z.object({
  new_password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

export const ROLE_OPTIONS = [
  { value: "cashier", label: "Cashier" },
  { value: "kitchen", label: "Kitchen" },
];

export const ROLE_CONFIG = {
  admin: { label: "Admin", variant: "warning" },
  cashier: { label: "Cashier", variant: "default" },
  kitchen: { label: "Kitchen", variant: "outline" },
};
