import { AppError } from "../../middleware/errorHandler.middleware.js";

export const VALID_TRANSITIONS = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isValidTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertStatusPermission(role, status) {
  const roles = status === "accepted" ? ["admin", "cashier"] : ["admin", "cashier", "kitchen"];
  if (!roles.includes(role)) {
    throw new AppError(403, "You do not have permission to perform this order action", "FORBIDDEN");
  }
  // Cancellation requires its own refund and inventory bookkeeping workflow.
  if (!["accepted", "preparing", "completed"].includes(status)) {
    throw new AppError(400, "Use the appropriate order action", "INVALID_TRANSITION");
  }
}

export function authorizeStatus(req, _res, next) {
  try {
    assertStatusPermission(req.user.role, req.body.status);
    next();
  } catch (error) {
    next(error);
  }
}
