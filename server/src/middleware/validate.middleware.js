import { errorResponse } from "../utils/response.js";

/**
 * Zod Validation Middleware — req.body
 *
 * Validates req.body against a Zod schema before the controller runs.
 * If validation fails → sends error response, controller never executes.
 * If validation passes → replaces req.body with parsed (sanitized) data.
 *
 * Use for POST, PATCH, PUT routes where data comes in the request body.
 */
export const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return errorResponse(
        res,
        result.error.issues[0].message,
        null,
        400,
        "VALIDATION_ERROR",
      );
    }

    // Replace req.body with parsed (sanitized) data
    req.body = result.data;
    next();
  };
};

/**
 * Zod Validation Middleware — req.query
 *
 * Validates req.query against a Zod schema before the controller runs.
 * If validation fails → sends error response, controller never executes.
 * If validation passes → stores parsed data on req.validatedQuery.
 *
 * Note: req.query is getter-only in Express 5 (returns a fresh object each
 * access), so we cannot write to it. Instead, we store the validated result
 * on a custom property that controllers read from.
 *
 * Use for GET routes where data comes in URL query string (?page=1&limit=50).
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return errorResponse(
        res,
        result.error.issues[0].message,
        null,
        400,
        "VALIDATION_ERROR",
      );
    }

    // Store validated data on custom property — req.query is immutable in Express 5
    req.validatedQuery = result.data;
    next();
  };
};
