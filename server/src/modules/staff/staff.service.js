import bcrypt from "bcryptjs";
import { staffRepository } from "./staff.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { notificationService } from "../notifications/notification.service.js";

const SALT_ROUNDS = 10;

function mapToStaffResponse(user) {
  return {
    staff_id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.isActive,
    must_change_pwd: user.mustChangePwd,
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

  async createStaff({ name, email, role, password }, userId) {
    const existing = await staffRepository.findByEmail(email);
    if (existing) throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
    const plain = password || `${name.split(" ")[0]}@12345`;
    const passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
    const user = await staffRepository.create({ name, email, role, passwordHash, mustChangePwd: true });
    auditLogService.logAction({ userId, action: ACTIONS.STAFF_CREATED, targetType: "staff", targetId: user.id, details: { name: user.name, email: user.email, role: user.role } });
    notificationService.create({ type: "system", title: "New Staff Added", message: `${user.name} (${role}) has been added to the team`, referenceType: "staff", referenceId: user.id }).catch(() => {});
    return { staff: mapToStaffResponse(user), temp_password: plain };
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
    const updated = await staffRepository.setActive(id, !user.isActive);
    auditLogService.logAction({ userId, action: !user.isActive ? ACTIONS.STAFF_ACTIVATED : ACTIONS.STAFF_DEACTIVATED, targetType: "staff", targetId: id, details: { name: user.name } });
    notificationService.create({ type: "system", title: user.isActive ? "Staff Deactivated" : "Staff Activated", message: `${user.name} has been ${user.isActive ? "deactivated" : "activated"}`, referenceType: "staff", referenceId: id }).catch(() => {});
    return { staff_id: updated.id, is_active: updated.isActive };
  },

  async resetPassword(id, newPassword, userId) {
    const user = await staffRepository.findById(id);
    if (!user) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await staffRepository.resetPassword(id, passwordHash);
    auditLogService.logAction({ userId, action: ACTIONS.STAFF_PASSWORD_RESET, targetType: "staff", targetId: id, details: { name: user.name } });
    return { success: true };
  },

  async deleteStaff(id, userId) {
    const user = await staffRepository.findById(id);
    if (!user) throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    const hasTx = await staffRepository.hasTransactions(id);
    if (hasTx) throw new AppError(400, "Cannot delete staff with transaction history", "STAFF_HAS_TRANSACTIONS");
    auditLogService.logAction({ userId, action: ACTIONS.STAFF_DELETED, targetType: "staff", targetId: id, details: { name: user.name } });
    return staffRepository.deleteUser(id);
  },
};
