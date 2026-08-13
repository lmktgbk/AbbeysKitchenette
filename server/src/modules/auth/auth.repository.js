import prisma from "../../config/prisma.js";

/**
 * Auth Repository
 * All database queries related to authentication.
 * This layer only touches Prisma for auth operations.
 */

// object type for readability and consistency
export const authRepository = {
  /* ── Lookups ─────────────────────────── */

  /**
   * Find a user by email including credential fields.
   * Only function that returns passwordHash — used for email+password login.
   * @param {string} email - email address
   * @returns {object|null} - user with credentials or null if not found
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
   * Find a user by email — minimal fields only.
   * Used for forgot password (just needs id to generate reset token).
   * @param {string} email - email address
   * @returns {object|null} - minimal user object or null if not found
   */
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  },

  /**
   * Find a user by ID — including PIN hash and lockout info.
   * Used for PIN-based login.
   * @param {string} id - user's UUID
   * @returns {object|null} - user with PIN data or null if not found
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
   * Find a user by ID — safe fields only (no passwordHash, no pinHash).
   * Safe to return to the client.
   * @param {string} id - user's UUID
   * @returns {object|null} - safe user object or null if not found
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
   * Returns all active staff for the PIN login selection grid.
   * Only returns id, name, role — no emails, no PINs, no sensitive data.
   * @returns {Array<{id: string, name: string, role: string}>} - staff list
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

  /* ── Updates ─────────────────────────── */

  /**
   * Updates the user's lastLoginAt timestamp.
   * Called on successful login (email or PIN).
   * @param {string} userId - user's UUID
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
   * @param {string} userId - user's UUID
   * @param {number} currentAttempts - current failed attempt count
   * @param {number} lockoutMinutes - minutes to lock after max attempts
   */
  async incrementFailedPinAttempts(userId, currentAttempts, lockoutMinutes) {
    const newAttempts = currentAttempts + 1;
    const lockUntil =
      newAttempts >= 5
        ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
        : null;

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
   * @param {string} userId - user's UUID
   */
  async resetFailedPinAttempts(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        failedPinAttempts: 0,
        lockedUntil: null,
      },
    });
  },

  /**
   * Updates password hash for a user.
   * Used during password reset from email link.
   * @param {string} userId - user's UUID
   * @param {string} passwordHash - new bcrypt-hashed password
   */
  async updatePassword(userId, passwordHash) {
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  },

  /**
   * Updates PIN hash for a user.
   * Used during PIN setup or admin PIN reset.
   * @param {string} userId - user's UUID
   * @param {string} pinHash - new bcrypt-hashed PIN
   */
  async updatePin(userId, pinHash) {
    return prisma.user.update({
      where: { id: userId },
      data: { pinHash },
    });
  },

  /**
   * Sets the mustChangePwd flag.
   * Admin sets true when resetting staff PIN.
   * Change-pin sets false after staff creates new PIN.
   * @param {string} userId - user's UUID
   * @param {boolean} value - true or false
   */
  async setMustChangePwd(userId, value) {
    return prisma.user.update({
      where: { id: userId },
      data: { mustChangePwd: value },
    });
  },
};
