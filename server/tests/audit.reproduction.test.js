// Fixed authentication findings assert safe behavior; remaining cases characterize open defects.
// All database and external-service dependencies are mocked. Never uses .env.
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  otpCode: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  passwordResetToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  orderItem: { update: vi.fn(), updateMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
db.$transaction = vi.fn(callback => callback(db));
vi.mock("../src/config/prisma.js", () => ({ default: db }));
vi.mock("../src/config/env.js", () => ({ env: {
  JWT_SECRET: "audit-only-secret-never-used-for-real-authentication",
  JWT_EXPIRES_IN: "8h", NODE_ENV: "test", CLIENT_URL: "http://localhost:5173",
} }));
vi.mock("../src/infrastructure/integrations/email.js", () => ({ sendEmail: vi.fn().mockResolvedValue({}), generateOtpEmail: vi.fn(), generateResetPasswordEmail: vi.fn() }));
vi.mock("../src/infrastructure/storage/imageCleanup.js", () => ({ deleteImage: vi.fn() }));
vi.mock("../src/utils/ipCheck.js", () => ({ isStoreIP: vi.fn().mockResolvedValue(true) }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/notifications/notification.service.js", () => ({ notificationService: { create: vi.fn().mockResolvedValue({}) } }));
vi.mock("../src/modules/products/product.service.js", () => ({ productService: {} }));
vi.mock("../src/modules/shifts/shift.service.js", () => ({ shiftService: {} }));
vi.mock("../src/modules/settings/settings.service.js", () => ({ settingsService: {} }));
vi.mock("../src/modules/anomalyDetection/anomalyDetection.service.js", () => ({ anomalyService: {} }));

import authenticate from "../src/middleware/authenticate.middleware.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { signToken } from "../src/config/jwt.js";
import { authService } from "../src/modules/auth/auth.service.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";
import { orderService } from "../src/modules/orders/order.service.js";
import { orderRepository } from "../src/modules/orders/order.repository.js";
import { getOrdersQuerySchema, createOrderSchema, updateStatusSchema } from "../src/modules/orders/order.validation.js";
import { sendEmail } from "../src/infrastructure/integrations/email.js";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", role: "admin", isActive: true, email: "audit@example.invalid" };
beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("AUDIT: fixed authentication regressions and open business defects", () => {
  it("HTTP auth rejects password-reset JWTs before user lookup", async () => {
    const token = signToken({ sub: user.id, purpose: "password-reset" }, "15m");
    db.user.findUnique.mockResolvedValue(user);
    const req = { cookies: { token } };
    const next = vi.fn();
    await authenticate(req, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(req.user).toBeUndefined();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
  it("OTP resend and verify require the password-login challenge", async () => {
    db.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(authService.resendOtp(user.id)).rejects.toMatchObject({ statusCode: 401 });
    await expect(authService.verifyOtp(user.id, "123456")).rejects.toMatchObject({ statusCode: 401 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("status service rejects cancellation outside its bookkeeping workflow", async () => {
    vi.spyOn(orderRepository, "findById").mockResolvedValue({ orderId: "A", status: "accepted" });
    const update = vi.spyOn(orderRepository, "updateStatus").mockResolvedValue({});
    const cancel = vi.spyOn(orderService, "cancelOrDelete");
    vi.spyOn(orderService, "getById").mockResolvedValue({ status: "cancelled" });
    await expect(orderService.advanceStatus("A", "cancelled", { userId: user.id, userRole: "admin" })).rejects.toMatchObject({ statusCode: 400 });
    expect(update).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(updateStatusSchema.safeParse({ status: "cancelled" }).success).toBe(false);
  });
  it("prepared-item write requires the parent order and an active item", async () => {
    vi.spyOn(orderRepository, "lockOrder").mockResolvedValue({ status: "accepted" });
    vi.spyOn(orderService, "getById").mockResolvedValue({ order_id: "A" });
    db.orderItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(orderService.checkOrderItem("A", 999, true, user.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.orderItem.updateMany.mock.calls[0][0].where).toEqual({ orderId: "A", orderItemId: 999, removedAt: null });
  });
  it("prepare cannot overwrite cancellation after a stale accepted-state read", async () => {
    vi.spyOn(orderRepository, "findByIdGuard").mockResolvedValue({ status: "accepted" });
    const update = vi.spyOn(orderRepository, "updateStatus").mockResolvedValue(0);
    vi.spyOn(orderService, "getById").mockResolvedValue({});
    await expect(orderService.prepareOrder("A", user.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(update).toHaveBeenCalledWith("A", "preparing", { userId: user.id }, db, "accepted");
  });
  it("parallel login-strike writes use atomic increments", async () => {
    let count = 0;
    db.user.update.mockImplementation(async () => ({ failedLoginAttempts: ++count }));
    const r = await Promise.all([
      authRepository.incrementFailedLoginAttempts(user.id, 15),
      authRepository.incrementFailedLoginAttempts(user.id, 15),
    ]);
    expect(r.map(x => x.failedLoginAttempts)).toEqual([1, 2]);
    expect(db.user.update.mock.calls[0][0].data.failedLoginAttempts).toEqual({ increment: 1 });
  });
  it("reset-token consumption requires unused and unexpired state", async () => {
    db.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(authRepository.resetPassword("used-token", user.id, 0, "new-hash")).rejects.toMatchObject({ statusCode: 401 });
    expect(db.passwordResetToken.updateMany.mock.calls[0][0].where).toMatchObject({ userId: user.id, usedAt: null, expiresAt: { gt: expect.any(Date) } });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it("order list validates zero/huge limits, junk page, and invalid dates", () => {
    expect(getOrdersQuerySchema.safeParse({ page: "junk", limit: "0", date_from: "bad-date" }).success).toBe(false);
    expect(getOrdersQuerySchema.safeParse({ limit: "999999999" }).success).toBe(false);
  });
  it("order validation rejects quantity exceeding PostgreSQL integer capacity", () => {
    expect(createOrderSchema.safeParse({
      customer_name: "Audit", table_number: "Takeout", amount_paid: 1,
      items: [{ product_id: user.id, variant_id: 1, quantity: 2147483648, unit_price: 1 }],
    }).success).toBe(false);
  });
  it("malformed JSON is serialized as a safe 400", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new SyntaxError("invalid JSON"), { status: 400, type: "entity.parse.failed" });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(err, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    spy.mockRestore();
  });
});
