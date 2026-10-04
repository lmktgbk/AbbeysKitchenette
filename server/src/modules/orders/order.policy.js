import { AppError } from "../../middleware/errorHandler.middleware.js";

// Business lifecycle only: permissions and concurrent-write guards are checked separately.
// Terminal orders have no outgoing transitions, so cancellation cannot be undone by preparation.
export const VALID_TRANSITIONS = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Check lifecycle eligibility; callers must still guard the actual database write against stale status. */
export function isValidTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Authorize the generic acceptance/preparation/completion action.
 * This checks role and action type, not an order's current state or stock effects.
 * Services also invoke this check so authorization does not depend solely on routing.
 */
export function assertStatusPermission(role, status) {
  // Acceptance records payment and reserves stock; kitchen staff can only prepare or complete.
  const roles = status === "accepted" ? ["admin", "cashier"] : ["admin", "cashier", "kitchen"];
  if (!roles.includes(role)) {
    throw new AppError(403, "You do not have permission to perform this order action", "FORBIDDEN");
  }
  // Cancellation requires its own refund and inventory bookkeeping workflow.
  if (!["accepted", "preparing", "completed"].includes(status)) {
    throw new AppError(400, "Use the appropriate order action", "INVALID_TRANSITION");
  }
}

/** Express adapter: run after authentication and forward permission errors to the shared handler. */
export function authorizeStatus(req, _res, next) {
  try {
    assertStatusPermission(req.user.role, req.body.status);
    next();
  } catch (error) {
    next(error);
  }
}
