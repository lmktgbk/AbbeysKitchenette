import bcrypt from "bcryptjs";
import crypto from "crypto";
import { staffRepository } from "./staff.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { notificationService } from "../notifications/notification.service.js";
import { sendEmail, generateStaffInviteEmail } from "../../utils/email.js";
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
    const user = await staffRepository.create({ name, email, role, passwordHash });
    auditLogService.logAction({ userId, action: ACTIONS.STAFF_CREATED, targetType: "staff", targetId: user.id, details: { name: user.name, email: user.email, role: user.role } });
    notificationService.create({ type: "system", title: "New Staff Added", message: `${user.name} (${role}) has been added to the team`, referenceType: "staff", referenceId: user.id }).catch(() => {});
    // Email the set-password link. Return emailed flag so UI can warn if mail failed.
    // The link is single-use: stored (hashed) and burned on first reset.
    try {
      const resetToken = signToken({ sub: user.id, purpose: "password-reset" }, "15m");
      const resetUrl = `${env.CLIENT_URL}/reset-password?token=${resetToken}`;
      const { authRepository } = await import("../auth/auth.repository.js");
      await authRepository.issueResetToken(
        user.id,
        resetToken,
        new Date(Date.now() + 15 * 60 * 1000),
      );
      await sendEmail({
        to: user.email,
        subject: "Your Staff Account — Set Your Password",
        html: generateStaffInviteEmail(resetUrl, user.name?.split(" ")[0]),
      });
      auditLogService.logAction({ userId, action: ACTIONS.PASSWORD_RESET_REQUESTED, targetType: "staff", targetId: user.id, details: { email: user.email, role: user.role, context: "invite" } }).catch(() => {});
    } catch (err) {
      console.error("[STAFF_INVITE_EMAIL]", err);
      auditLogService.logAction({ userId, action: ACTIONS.PASSWORD_RESET_REQUESTED, targetType: "staff", targetId: user.id, details: { email: user.email, role: user.role, context: "invite", emailed: false } }).catch(() => {});
      return { staff: mapToStaffResponse(user), emailed: false };
    }
    return { staff: mapToStaffResponse(user), emailed: true };
  },

  async updateStaff(id, { name, email, role }, userId) {
    const user = await staffRepository.findById(id);
    if (!user) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    if (email && email !== user.email) {
      const existing = await staffRepository.findByEmail(email);
      if (existing) throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
    }
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (Object.keys(updateData).length === 0) throw new AppError(400, "No valid fields to update", "NO_CHANGES");
    const updated = await staffRepository.update(id, updateData);
    auditLogService.logAction({ userId, action: ACTIONS.STAFF_UPDATED, targetType: "staff", targetId: id, details: { name: user.name, fields: Object.keys(updateData) } });
    return mapToStaffResponse(updated);
  },

  async toggleActive(id, userId) {
    const user = await staffRepository.findById(id);
    if (!user) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    // Deactivation is the safe offboard: authenticate blocks !isActive, and
    // all actor FKs keep resolving to a name. Delete is the last resort.
    const updated = await staffRepository.setActive(id, !user.isActive);
    auditLogService.logAction({ userId, action: !user.isActive ? ACTIONS.STAFF_ACTIVATED : ACTIONS.STAFF_DEACTIVATED, targetType: "staff", targetId: id, details: { name: user.name } });
    notificationService.create({ type: "system", title: user.isActive ? "Staff Deactivated" : "Staff Activated", message: `${user.name} has been ${user.isActive ? "deactivated" : "activated"}`, referenceType: "staff", referenceId: id }).catch(() => {});
    return { staff_id: updated.id, is_active: updated.isActive };
  },

  async deleteStaff(id, userId) {
    const user = await staffRepository.findById(id);
    if (!user) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    // Hard delete is blocked when the user touched money or stock — dangling
    // actor names in orders/shifts/audit would otherwise lose their meaning.
    const hasTx = await staffRepository.hasTransactions(id);
    if (hasTx) throw new AppError(400, "Cannot delete staff with transaction history", "STAFF_HAS_TRANSACTIONS");
    const deleted = await staffRepository.deleteUser(id);
    auditLogService.logAction({ userId, action: ACTIONS.STAFF_DELETED, targetType: "staff", targetId: id, details: { name: user.name } });
    return deleted;
  },
};
