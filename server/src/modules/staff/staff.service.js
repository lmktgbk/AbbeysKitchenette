import bcrypt from "bcryptjs";
import crypto from "crypto";
import { staffRepository } from "./staff.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { sendAuthEmail } from "../auth/authEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import prisma from "../../config/prisma.js";
import { recordEffects, recordMutation } from "../../services/domainEffects.js";
import { revokeLocalSessions } from "../../realtime/sessions.js";
import { generateStaffInviteEmail } from "../../utils/email.js";
import { signToken } from "../../config/jwt.js";
import { env } from "../../config/env.js";

/**
 * Staff Service (admin-only callers — enforced in staff.routes.js)
 *
 * Owns user lifecycle: invite via email reset link, profile edits, activate /
 * deactivate, and guarded deletes. Admins never see or handle passwords —
 * staff set their own via the emailed set-password link.
 */
const SALT_ROUNDS = 10;

function mapToStaffResponse(user) {
  return {
    staff_id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.isActive,
    last_login_at: user.lastLoginAt,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

export const staffService = {
  async getSummary() {
    return staffRepository.getSummary();
  },

  async listStaff({ search, role, status, sortBy, sortDir, page, limit }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const [users, totalItems] = await Promise.all([
      staffRepository.findPaginated({ search, role, status, sortBy, sortDir, skip, take: limitNum }),
      staffRepository.countFiltered({ search, role, status }),
    ]);
    const enriched = users.map(mapToStaffResponse);
    return { staff: enriched, totalItems };
  },

  async getStaff(id) {
    const user = await staffRepository.findById(id);
    if (!user) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    return mapToStaffResponse(user);
  },

  async createStaff({ name, email, role }, userId) {
    const existing = await staffRepository.findByEmail(email);
    if (existing) throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
    // No password is set by admin. Create with an unusable random hash, then
    // email a set-password link so staff choose their own password.
    const placeholder = crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(placeholder, SALT_ROUNDS);
    let user;
    try {
      user = await recordMutation(prisma,
        tx => staffRepository.create({ name, email, role, passwordHash }, tx),
        row => ({ audit: { userId, action: ACTIONS.STAFF_CREATED, targetType: "staff", targetId: row.id,
          details: { name: row.name, email: row.email, role: row.role } },
        notifications: [{ type: "system", title: "New Staff Added", message: `${row.name} (${role}) has been added to the team`, referenceType: "staff", referenceId: row.id }] }));
    } catch (error) {
      if (error.code === "P2002") throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
      throw error;
    }
    // Email the set-password link. Return emailed flag so UI can warn if mail failed.
    // The link is single-use: stored (hashed) and burned on first reset.
    try {
      const resetToken = signToken({ sub: user.id, purpose: "password-reset", version: 0 }, "15m");
      const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;
      const { authRepository } = await import("../auth/auth.repository.js");
      const issued = await authRepository.issueResetToken(
        user.id,
        resetToken,
        new Date(Date.now() + 15 * 60 * 1000),
        0, userId, "staff-invite",
      );
      await sendAuthEmail({
        to: user.email,
        subject: "Your Staff Account — Set Your Password",
        html: generateStaffInviteEmail(resetUrl, user.name?.split(" ")[0]),
      }, { userId, subjectId: user.id, context: "staff-invite", requestId: issued.id },
      () => authRepository.discardResetToken(user.id, resetToken));
    } catch (err) {
      console.warn("[staff] Invitation delivery unavailable", err?.code ?? "DELIVERY_FAILED");
      return { staff: mapToStaffResponse(user), emailed: false };
    }
    return { staff: mapToStaffResponse(user), emailed: true };
  },

  async updateStaff(id, { name, email, role }, userId) {
    const user = await staffRepository.findById(id);
    if (!user) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    if (email && email !== user.email) {
      if (id === userId) throw new AppError(400, "Verify your own email through My Profile", "EMAIL_VERIFICATION_REQUIRED");
      const existing = await staffRepository.findByEmail(email);
      if (existing) throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
    }
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (Object.keys(updateData).length === 0) throw new AppError(400, "No valid fields to update", "NO_CHANGES");
    let updated;
    try {
      updated = await recordMutation(prisma, tx => staffRepository.update(id, updateData, tx),
        row => ({ audit: { userId, action: ACTIONS.STAFF_UPDATED, targetType: "staff", targetId: id,
          details: { name: row.name, fields: Object.keys(updateData) } } }));
    } catch (error) {
      if (error.code === "P2002") throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
      if (error.code === "P2025") throw new AppError(409, "Staff changed. Refresh and retry", "STAFF_CHANGED");
      throw error;
    }
    revokeLocalSessions(id);
    return mapToStaffResponse(updated);
  },

  async toggleActive(id, userId) {
    const updated = await prisma.$transaction(async tx => {
      // A toggle derives its new value from the locked row, never a stale read.
      const rows = await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows.length) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
      const user = await staffRepository.findById(id, tx);
      const row = await staffRepository.setActive(id, !user.isActive, tx);
      await recordEffects(tx, {
        audit: { userId, action: row.isActive ? ACTIONS.STAFF_ACTIVATED : ACTIONS.STAFF_DEACTIVATED,
          targetType: "staff", targetId: id, details: { name: user.name } },
        notifications: [{ type: "system", title: row.isActive ? "Staff Activated" : "Staff Deactivated",
          message: `${user.name} has been ${row.isActive ? "activated" : "deactivated"}`, referenceType: "staff", referenceId: id }],
      });
      return row;
    }, { timeout: 5000 });
    revokeLocalSessions(id);
    return { staff_id: updated.id, is_active: updated.isActive };
  },

  async deleteStaff(id, userId) {
    const deleted = await prisma.$transaction(async tx => {
      // FOR UPDATE also serializes new FK references with the history check.
      const rows = await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows.length) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
      if (await staffRepository.hasTransactions(id, tx)) {
        throw new AppError(400, "Cannot delete staff with transaction history", "STAFF_HAS_TRANSACTIONS");
      }
      const row = await staffRepository.deleteUser(id, tx);
      await recordEffects(tx, { audit: { userId, action: ACTIONS.STAFF_DELETED,
        targetType: "staff", targetId: id, details: { name: row.name } } });
      return row;
    }, { timeout: 5000 });
    revokeLocalSessions(id);
    return deleted;
  },
};
