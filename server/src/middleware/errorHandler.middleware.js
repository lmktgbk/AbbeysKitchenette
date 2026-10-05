import crypto from "crypto";
import { AppError, mapRequestError, mapPrismaError, mapUploadError } from "../utils/response.js";

// Keep the established import path while the class lives with shared response helpers.
export { AppError } from "../utils/response.js";

/**
 * Global Express Error Handler
 *
 * Catches all errors from middleware/routes (must be registered last).
 *
 * - AppError instances: return their message + code (safe to expose)
 * - Unexpected errors: return generic message + reference ID (hide internals)
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  // Expected error — show message and code
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.code,
      data: null,
    });
  }

  // Known Prisma races/conflicts + upload rejections — never 500s.
  const mapped = mapRequestError(err) || mapPrismaError(err) || mapUploadError(err);
  if (mapped) {
    return res.status(mapped.statusCode).json({
      success: false,
      message: mapped.message,
      error: mapped.code,
      data: null,
    });
  }

  // Unexpected error — hide internals, log for debugging
  const ref = req.requestId ?? crypto.randomBytes(4).toString("hex");
  // Database/provider messages can contain SQL values or credentials. Production
  // correlation uses the request ID and error class without serializing errors.
  if (process.env.NODE_ENV === "production") {
    console.error(JSON.stringify({ event: "application_error", requestId: ref, type: err.name || "Error" }));
  } else {
    console.error(`[${ref}] ${err.message}`);
    console.error(err.stack);
  }

  return res.status(500).json({
    success: false,
    message: "Something went wrong",
    error: "INTERNAL_ERROR",
    reference: ref,
    data: null,
  });
};

export default errorHandler;
