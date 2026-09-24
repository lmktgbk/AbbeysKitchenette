import prisma from "../../config/prisma.js";

/**
 * Auth Repository
 *
 * findByEmailWithCredentials is the ONLY query in the codebase that selects
 * passwordHash — it exists solely for bcrypt.compare at login and the hash
 * is stripped (safeUser) before anything leaves the service layer.
 */
export const authRepository = {
  async findByEmailWithCredentials(email) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        passwordHash: true,
        imageUrl: true,
        isActive: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
      },
    });
  },

  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, isActive: true },
    });
  },

  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        imageUrl: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  },

  async isEmailTaken(email, userId) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return existing && existing.id !== userId;
  },

  async updateLastLogin(userId) {
    return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  },

  async incrementFailedLoginAttempts(userId, currentAttempts, lockoutMinutes) {
    const newAttempts = currentAttempts + 1;
    const lockUntil = newAttempts >= 5 ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null;
    return prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: newAttempts,
        ...(lockUntil && { lockedUntil: lockUntil }),
      },
    });
  },

  async resetFailedLoginAttempts(userId) {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  },

  async updatePassword(userId, passwordHash) {
    return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },

  async updateProfile(userId, data) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, name: true, email: true, role: true, imageUrl: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
  },

  async updateImageUrl(userId, imageUrl) {
    return prisma.user.update({
      where: { id: userId },
      data: { imageUrl },
      select: {
        id: true, name: true, email: true, role: true, imageUrl: true,
        isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
  },

  async getPasswordHash(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    return user?.passwordHash ?? null;
  },
};
