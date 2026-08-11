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

// Email + password login.
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .pipe(
      z.email({
        error: "Please enter a valid email address",
      }),
    ),

  password: z.string().min(1, "Password is required"),
});

/**
 * PIN login.
 * userId is the staff member's UUID from the selection grid.
 * pin is 4-6 digits.
 */
export const loginPinSchema = z.object({
  userId: z.string().uuid("Invalid user"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
});
