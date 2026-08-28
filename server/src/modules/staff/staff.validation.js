import { z } from "zod";

/**
 * Staff Validation Schemas
 *
 * Used by validate middleware to validate request bodies.
 * If validation fails → error response, controller never executes.
 */

// Used by POST /api/staff — create staff
export const createStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(255, "Email must not exceed 255 characters"),
  role: z.enum(["cashier", "kitchen"], {
    message: "Role is required",
  }),
});

// Used by PATCH /api/staff/:id — update staff
export const updateStaffSchema = z.object({
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
    .max(255, "Email must not exceed 255 characters")
    .optional(),
  role: z.enum(["cashier", "kitchen"]).optional(),
});

// Used by POST /api/staff/:id/reset-pin
export const resetPinSchema = z.object({
  new_pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});

// Used by POST /api/staff/:id/reset-password
export const resetPasswordSchema = z.object({
  new_password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must not exceed 128 characters"),
});

// Used by PATCH /api/staff/:id/toggle-active, DELETE /api/staff/:id
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid staff ID"),
});

// Used by GET /api/staff — query params
export const getStaffQuerySchema = z.object({
  page: z.string().optional().default("1"),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a positive integer")
    .optional()
    .default("50"),
  search: z.string().optional(),
  role: z.enum(["all", "admin", "cashier", "kitchen"]).optional().default("all"),
  status: z.enum(["all", "active", "inactive"]).optional().default("all"),
  sortBy: z
    .enum(["name", "email", "role", "isActive", "lastLoginAt", "createdAt"])
    .optional()
    .default("name"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});

// Used by GET /api/staff/performance — query params
export const getPerformanceQuerySchema = z.object({
  role: z.enum(["all", "admin", "cashier", "kitchen"]).optional().default("all"),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});
