/**
 * Response Helpers
 *
 * Standardized JSON response format used across all controllers.
 * Ensures every API response has the same shape:
 *
 * Success: { success: true, message, data }
 * Error:   { success: false, message, error, data: null }
 */

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
