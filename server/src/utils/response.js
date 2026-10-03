/**
 * Response Helpers
 *
 * Standardized JSON response format used across all controllers.
 * Ensures every API response has the same shape:
 *
 * Success: { success: true, message, data }
 * Error:   { success: false, message, error, data: null }
 */

import { AppError } from "../middleware/errorHandler.middleware.js";

/**
 * Sends a success response.
 *
 * @param {object} res - Express response object
 * @param {string} message - Human-readable success message
 * @param {*} data - Response data (default: null)
 * @param {number} statusCode - HTTP status (default: 200)
 */
export const successResponse = (
  res,
  message,
  data = null,
  statusCode = 200,
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Sends an error response.
 *
 * @param {object} res - Express response object
 * @param {string} message - Human-readable error message
 * @param {*} data - Additional error data (default: null)
 * @param {number} statusCode - HTTP status (default: 400)
 * @param {string|null} errorCode - Machine-readable code (default: null)
 */
export const errorResponse = (
  res,
  message,
  data = null,
  statusCode = 400,
  errorCode = null,
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: errorCode,
    data,
  });
};

/**
 * Maps known Prisma race/conflict errors to safe client responses.
 * Returns { statusCode, message, code } or null when unrecognized.
 * Shared by controllerError and the global error handler so both
 * serialize identically.
 */
export const mapPrismaError = (error) => {
  if ((["P2004", "P2010", "P2039"].includes(error?.code) || error?.name === "PrismaClientUnknownRequestError") &&
      `${error.message ?? ""} ${error.meta?.message ?? ""}`.includes("IMAGE_NOT_AVAILABLE")) {
    return { statusCode: 409, message: "Image is no longer available. Upload it again.", code: "IMAGE_NOT_AVAILABLE" };
  }
  if (error?.code === "P2020") return { statusCode: 400, message: "Calculated value exceeds the supported storage range", code: "VALUE_OUT_OF_RANGE" };
  // Unique-constraint race (e.g. concurrent creates with the same name).
  if (error?.code === "P2002") {
    return {
      statusCode: 409,
      message: "A record with these details already exists",
      code: "DUPLICATE_ENTRY",
    };
  }
  // Optimistic-lock race (version-guard mismatch on stock batches).
  if (error?.code === "P2025") {
    return {
      statusCode: 409,
      message: "Stock changed while processing — please retry",
      code: "CONCURRENT_STOCK",
    };
  }
  // Foreign-key violation (referenced row missing/deleted mid-flight).
  if (error?.code === "P2003") {
    return {
      statusCode: 409,
      message: "Referenced record does not exist",
      code: "INVALID_REFERENCE",
    };
  }
  return null;
};

// Parser messages can embed credentials or request fragments; return fixed text instead.
export const mapRequestError = (error) => {
  const errors = {
    "entity.parse.failed": [400, "Malformed request body", "INVALID_BODY"],
    "entity.too.large": [413, "Request body is too large", "BODY_TOO_LARGE"],
    "parameters.too.many": [413, "Too many form fields", "TOO_MANY_FIELDS"],
    "querystring.parse.rangeError": [400, "Form nesting is too deep", "INVALID_BODY"],
    "encoding.unsupported": [415, "Unsupported content encoding", "UNSUPPORTED_ENCODING"],
    "charset.unsupported": [415, "Unsupported character encoding", "UNSUPPORTED_CHARSET"],
    "request.aborted": [400, "Request was interrupted", "INVALID_BODY"],
    "request.size.invalid": [400, "Invalid request length", "INVALID_BODY"],
  };
  const mapped = Object.hasOwn(errors, error?.type) ? errors[error.type] : null;
  return mapped ? { statusCode: mapped[0], message: mapped[1], code: mapped[2] } : null;
};

/**
 * Maps multer upload rejections to safe client responses.
 * Covers the image fileFilter ("Only image files…") and size limits —
 * both would otherwise surface as generic 500s.
 * Returns { statusCode, message, code } or null when unrecognized.
 */
export const mapUploadError = (error) => {
  if (error?.name === 'MulterError' && error.code !== 'LIMIT_FILE_SIZE') {
    return { statusCode: 400, message: 'Invalid multipart upload or too many fields/files', code: 'INVALID_MULTIPART' };
  }
  if (error?.name === "MulterError" && error?.code === "LIMIT_FILE_SIZE") {
    return {
      statusCode: 413,
      message: "Image is too large — 5MB max for products, 2MB for avatars",
      code: "FILE_TOO_LARGE",
    };
  }
  if (
    error?.message === "Only image files are allowed (jpeg, jpg, png, gif, webp)"
  ) {
    return {
      statusCode: 400,
      message: error.message,
      code: "INVALID_FILE_TYPE",
    };
  }
  return null;
};

/**
 * Single error serializer for controllers.
 * Replaces the per-controller handleError copies: AppError passes through,
 * known Prisma races map to 409s, everything else becomes a generic 500
 * (logged server-side with the caller's fallback code).
 */
export const controllerError = (res, error, fallbackCode) => {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  const mapped = mapRequestError(error) || mapPrismaError(error) || mapUploadError(error);
  if (mapped) {
    return errorResponse(res, mapped.message, null, mapped.statusCode, mapped.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
};
