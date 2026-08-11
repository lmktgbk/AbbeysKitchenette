import { errorResponse } from "../utils/response.js";

/**
 * Zod Validation Middleware
 *
 * Validates req.body against a Zod schema before the controller runs.
 * If validation fails → sends error response, controller never executes.
 * If validation passes → replaces req.body with parsed (sanitized) data.
 *
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Zod failed — send the first error message
      return errorResponse(
        res,
        result.error.issues[0].message,
        null,
        400,
        "VALIDATION_ERROR",
      );
    }

    // Zod passed — replace req.body with parsed (sanitized) data
    // This ensures req.body only contains fields defined in the schema
    req.body = result.data;
    next();
  };
};
