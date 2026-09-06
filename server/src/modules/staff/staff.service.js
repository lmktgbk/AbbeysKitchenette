import bcrypt from "bcryptjs";
import { staffRepository } from "./staff.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { sendEmail, generateNewPinEmail } from "../../utils/email.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

const SALT_ROUNDS = 10;

/**
 * Staff Service
 *
 * Business logic for staff CRUD, PIN/password management, and performance.
 */

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
  /**
   * Get paginated staff list.
   */
  async listStaff({ search, role, status, sortBy, sortDir, page, limit }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [users, totalItems] = await Promise.all([
      staffRepository.findPaginated({
        search,
        role,
        status,
        sortBy,
        sortDir,
        skip,
        take: limitNum,
      }),
      staffRepository.countFiltered({ search, role, status }),
    ]);

    const enriched = users.map(mapToStaffResponse);
    return { staff: enriched, totalItems };
  },

  /**
   * Get single staff detail.
   */
  async getStaff(id) {
    const user = await staffRepository.findById(id);
    if (!user) {
      throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    }
    return mapToStaffResponse(user);
  },

  /**
   * Create a new staff member.
   * PIN is auto-generated (6 digits), hashed, and returned raw for one-time admin display.
   */
  async createStaff({ name, email, role }, userId) {
    // Check email uniqueness
    const existing = await staffRepository.findByEmail(email);
    if (existing) {
      throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
    }

    // Auto-generate 6-digit PIN
    const rawPin = String(Math.floor(100000 + Math.random() * 900000));
    const pinHash = await bcrypt.hash(rawPin, SALT_ROUNDS);

    const user = await staffRepository.create({
      name,
      email,
      role,
      passwordHash: "",
      pinHash,
      mustChangePwd: true,
    });

    // Send email to staff with PIN
    try {
      await sendEmail({
        to: email,
        subject: "Your Abbey's Kitchenette PIN",
        html: generateNewPinEmail(rawPin),
      });
    } catch {
      // Email failure is non-blocking — admin still sees the PIN
    }

    auditLogService.logAction({ userId, action: ACTIONS.STAFF_CREATED, targetType: "staff", targetId: user.id, details: { name: user.name, email: user.email, role: user.role } });

    return {
      staff: mapToStaffResponse(user),
      raw_pin: rawPin,
    };
  },

  /**
   * Update staff fields.
   */
  async updateStaff(id, { name, email, role }, userId) {
    const user = await staffRepository.findById(id);
    if (!user) {
      throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    }

    // Check email uniqueness if changed
    if (email && email !== user.email) {
      const existing = await staffRepository.findByEmail(email);
      if (existing) {
        throw new AppError(409, "Email already in use", "EMAIL_IN_USE");
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, "No valid fields to update", "NO_CHANGES");
    }

    const updated = await staffRepository.update(id, updateData);
    auditLogService.logAction({ userId, action: ACTIONS.STAFF_UPDATED, targetType: "staff", targetId: id, details: { name: user.name, fields: Object.keys(updateData) } });
    return mapToStaffResponse(updated);
  },

  /**
   * Toggle active status.
   */
  async toggleActive(id, userId) {
    const user = await staffRepository.findById(id);
    if (!user) {
      throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    }

    const updated = await staffRepository.setActive(id, !user.isActive);
    auditLogService.logAction({ userId, action: !user.isActive ? ACTIONS.STAFF_ACTIVATED : ACTIONS.STAFF_DEACTIVATED, targetType: "staff", targetId: id, details: { name: user.name } });
    return {
      staff_id: updated.id,
      is_active: updated.isActive,
    };
  },

  /**
   * Reset PIN. Returns raw PIN for one-time admin display.
   */
  async resetPin(id, newPin, userId) {
    const user = await staffRepository.findById(id);
    if (!user) {
      throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    }

    const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);
    await staffRepository.resetPin(id, pinHash);

    // Email the new PIN to staff
    try {
      await sendEmail({
        to: user.email,
        subject: "Your Abbey's Kitchenette PIN Has Been Reset",
        html: generateNewPinEmail(newPin),
      });
    } catch {
      // Email failure is non-blocking
    }

    auditLogService.logAction({ userId, action: ACTIONS.STAFF_PIN_RESET, targetType: "staff", targetId: id, details: { name: user.name } });

    return { raw_pin: newPin };
  },

  /**
   * Reset password.
   */
  async resetPassword(id, newPassword, userId) {
    const user = await staffRepository.findById(id);
    if (!user) {
      throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await staffRepository.resetPassword(id, passwordHash);

    auditLogService.logAction({ userId, action: ACTIONS.STAFF_PASSWORD_RESET, targetType: "staff", targetId: id, details: { name: user.name } });

    return { success: true };
  },

  /**
   * Hard delete staff. Blocked if has transaction history.
   */
  async deleteStaff(id, userId) {
    const user = await staffRepository.findById(id);
    if (!user) {
      throw new AppError(404, "Staff not found", "STAFF_NOT_FOUND");
    }

    const hasTx = await staffRepository.hasTransactions(id);
    if (hasTx) {
      throw new AppError(
        400,
        "Cannot delete staff with transaction history",
        "STAFF_HAS_TRANSACTIONS"
      );
    }

    auditLogService.logAction({ userId, action: ACTIONS.STAFF_DELETED, targetType: "staff", targetId: id, details: { name: user.name } });

    return staffRepository.deleteUser(id);
  },

  /**
   * Get performance metrics.
   */
  async getPerformance({ role, date_from, date_to }) {
    return staffRepository.getPerformance({
      role,
      dateFrom: date_from,
      dateTo: date_to,
    });
  },
};
