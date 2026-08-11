import crypto from "crypto";

/**
 * Custom Error Class for Expected Errors
 *
 * Services throw AppError intentionally (e.g. "Product not found").
 * The error handler catches it and returns a structured JSON response.
 * Native Error instances (crashes) get hidden behind "Something went wrong".
 */

export class AppError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Global Express Error Handler
 *
 * Catches all errors from middleware/routes (must be registered last).
 *
 * - AppError instances: return their message + code (safe to expose)
 * - Unexpected errors: return generic message + reference ID (hide internals)
 */
const errorHandler = (err, req, res, next) => {
  // Expected error — show message and code
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.code,
      data: null,
    });
  }

  // Unexpected error — hide internals, log for debugging
  const ref = crypto.randomBytes(4).toString("hex");
  console.error(`[${ref}] ${err.message}`);
  console.error(err.stack);

  return res.status(500).json({
    success: false,
    message: "Something went wrong",
    error: "INTERNAL_ERROR",
    reference: ref,
    data: null,
  });
};

export default errorHandler;
