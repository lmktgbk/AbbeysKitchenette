import prisma from "../../config/prisma.js";

/**
 * Auth Repository
 * All database queries related to to authentication
 * This layer only touches PRISMA for auth operations
 */

// object type for readability and consistency
export const authRepository = {
  /**
   * Find a user email including other fields
   * Only function returns password hash in order to strip and return to client
   * @param {string} email - email address
   * @returns {object|null} - user w other fields or nulll if not found
   */
  async findByEmailWithCredentials(email) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        passwordHash: true,
        pinHash: true,
        isActive: true,
        mustChangePwd: true,
        failedPinAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
      },
    });
  },

  /**
   * Find a user by ID - including PIN Hash and lockout Info.
   * Used for PIN-Based Login.
   * @param {string} id - users id
   * @return {object|null} user with PIN data or null
   */
  async findByIdWithPin(id) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        pinHash: true,
        isActive: true,
        mustChangePwd: true,
        failedPinAttempts: true,
        lockedUntil: true,
      },
    });
  },

  /**
   * Finds a user by ID, excluding sensitive fields.
   * Safe to return to the client (no passwordHash, no pinHash).
   * @param {string} id - User's UUID
   * @returns {object|null} Safe user object, or null if not found
   */
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePwd: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  },

  /**
   * Returns all active staff members for the PIN login selection grid.
   * Only returns id, name, role — no emails, no PINs, no sensitive data.
   * @returns {Array<{id: string, name: string, role: string}>} Staff list
   */
  async findActiveStaff() {
    return prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Updates the user's lastLoginAt timestamp.
   * Called on successful login (email or PIN).
   *
   * @param {string} userId - User's UUID
   */
  async updateLastLogin(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  },

  /**
   * Increments failed PIN attempt counter.
   * Locks account for 15 minutes after 5 consecutive failures.
   * @param {string} userId - User's UUID
   * @param {number} currentAttempts - Current failed attempt count
   */
  async incrementFailedPinAttempts(userId, currentAttempts, lockoutMinutes) {
    const newAttempts = currentAttempts + 1;
    const lockUntil =
      newAttempts >= 5 ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null;

    return prisma.user.update({
      where: { id: userId },
      data: {
        failedPinAttempts: newAttempts,
        ...(lockUntil && { lockedUntil: lockUntil }),
      },
    });
  },

  /**
   * Resets failed PIN attempts and clears lockout.
   * Called on successful PIN login.
   * @param {string} userId - User's UUID
   */
  async resetFailedPinAttempts(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        failedPinAttempts: 0, //restart
        lockedUntil: null,
      },
    });
  },

  /**
   * Updates password hash and clears mustChangePwd flag.
   * Used during password change or first-time setup.
   * @param {string} userId - User's UUID
   * @param {string} passwordHash - New bcrypt-hashed password
   */
  async updatePassword(userId, passwordHash) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePwd: false,
      },
    });
  },

  /**
   * Updates PIN hash for a user.
   * Used during PIN setup or PIN reset.
   * @param {string} userId - User's UUID
   * @param {string} pinHash - New bcrypt-hashed PIN
   */
  async updatePin(userId, pinHash) {
    return prisma.user.update({
      where: { id: userId },
      data: { pinHash },
    });
  },
};
