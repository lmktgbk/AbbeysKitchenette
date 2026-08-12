import bcrypt from "bcryptjs";

import { authRepository } from "./auth.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { signToken } from "../../config/jwt.js";
import { isStoreIP } from "../../utils/ipCheck.js";

// Constants
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 15;

// Actual Business Logic
export const authService = {
  /**
   * Email + password login
   * @param {string} email
   * @param {string} password
   * @returns {{ token: string, user: object }}
   */
  async login(email, password, clientIP) {
    const user = await authRepository.findByEmailWithCredentials(email);

    // no user
    if (!user) {
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    // not activated
    if (!user.isActive) {
      throw new AppError(
        403,
        "Account is disabled. Contact administrator.",
        "ACCOUNT_DISABLED",
      );
    }

    // IP restriction for staff roles
    const restrictedRoles = ["cashier", "kitchen"];
    if (restrictedRoles.includes(user.role)) {
      const allowed = await isStoreIP(clientIP);
      if (!allowed) {
        throw new AppError(
          403,
          "Staff must login from store location",
          "STORE_IP_REQUIRED",
        );
      }
    }

    // check if password correct
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    // incorrect password
    if (!isPasswordValid) {
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    }

    // update login, date now to passed id
    await authRepository.updateLastLogin(user.id);

    // sub for subject - easily decoded later using .sub
    const token = signToken({ sub: user.id, role: user.role });
    // remove credentials then incorporate other data to safe user
    const { passwordHash, pinHash, ...safeUser } = user;

    return { token, user: safeUser };
  },

  /**
   * PIN login (store IP required — validated by middleware)
   * @param {string} userId - from staff grid selection
   * @param {string} pin - 4-6 digit PIN
   * @returns {{ token: string, user: object }}
   */
  async loginPin(userId, pin) {
    // find ID via pin
    const user = await authRepository.findByIdWithPin(userId);

    // if user not set
    if (!user) {
      throw new AppError(401, "Invalid PIN", "INVALID_PIN");
    }

    // if user not activated
    if (!user.isActive) {
      throw new AppError(
        403,
        "Account is disabled. Contact administrator.",
        "ACCOUNT_DISABLED",
      );
    }

    // if user is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000);
      throw new AppError(
        423,
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
        "ACCOUNT_LOCKED",
      );
    }

    // if pin was not set
    if (!user.pinHash) {
      throw new AppError(
        400,
        "No PIN set. Please login with email and password.",
        "NO_PIN_SET",
      );
    }

    // if pin find then check if
    const isPinValid = await bcrypt.compare(pin, user.pinHash);
    if (!isPinValid) {
      const updated = await authRepository.incrementFailedPinAttempts(
        user.id,
        user.failedPinAttempts,
        PIN_LOCKOUT_MINUTES,
      );

      const remaining = PIN_MAX_ATTEMPTS - updated.failedPinAttempts;
      if (remaining <= 0) {
        throw new AppError(
          423,
          "Account locked due to too many failed attempts.",
          "ACCOUNT_LOCKED",
        );
      }

      throw new AppError(
        401,
        `Invalid PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
        "INVALID_PIN",
      );
    }

    await authRepository.resetFailedPinAttempts(user.id);
    await authRepository.updateLastLogin(user.id);

    const token = signToken({ sub: user.id, role: user.role });
    const { passwordHash, pinHash, ...safeUser } = user;

    return { token, user: safeUser };
  },

  /**
   * Get all active staff for PIN login selection grid
   * @returns {Array<{ id: string, name: string, role: string }>}
   */
  async getStaffList() {
    return authRepository.findActiveStaff();
  },
};
