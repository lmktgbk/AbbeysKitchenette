// Fixed authentication findings assert safe behavior; remaining cases characterize open defects.
// All database and external-service dependencies are mocked. Never uses .env.
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  otpCode: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  passwordResetToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  orderItem: { update: vi.fn() },
  $queryRaw: vi.fn(),
}));
db.$transaction = vi.fn(callback => callback(db));
vi.mock("../src/config/prisma.js", () => ({ default: db }));
vi.mock("../src/config/env.js", () => ({ env: {
  JWT_SECRET: "audit-only-secret-never-used-for-real-authentication",
  JWT_EXPIRES_IN: "8h", NODE_ENV: "test", CLIENT_URL: "http://localhost:5173",
} }));
vi.mock("../src/utils/email.js", () => ({ sendEmail: vi.fn().mockResolvedValue({}), generateOtpEmail: vi.fn(), generateResetPasswordEmail: vi.fn() }));
vi.mock("../src/utils/cloudinary.js", () => ({ deleteImage: vi.fn() }));
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
import { sendEmail } from "../src/utils/email.js";

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
  it("latent cancelled service path skips bookkeeping, but HTTP schema blocks it", async () => {
    vi.spyOn(orderRepository, "findById").mockResolvedValue({ orderId: "A", status: "accepted" });
    const update = vi.spyOn(orderRepository, "updateStatus").mockResolvedValue({});
    const cancel = vi.spyOn(orderService, "cancelOrDelete");
    vi.spyOn(orderService, "getById").mockResolvedValue({ status: "cancelled" });
    await orderService.advanceStatus("A", "cancelled", { userId: user.id });
    expect(update).toHaveBeenCalledWith("A", "cancelled", { userId: user.id });
    expect(cancel).not.toHaveBeenCalled();
    expect(updateStatusSchema.safeParse({ status: "cancelled" }).success).toBe(false);
  });
  it("prepared-item write is scoped only to item ID, not parent order", async () => {
    vi.spyOn(orderRepository, "findByIdGuard").mockResolvedValue({ orderId: "A", status: "accepted" });
    vi.spyOn(orderService, "getById").mockResolvedValue({ order_id: "A" });
    db.orderItem.update.mockResolvedValue({ orderItemId: 999, orderId: "B", isPrepared: true });
    await orderService.checkOrderItem("A", 999, true, user.id);
    expect(db.orderItem.update.mock.calls[0][0].where).toEqual({ orderItemId: 999 });
  });
  it("prepare writes unconditionally after a stale accepted-state read", async () => {
    vi.spyOn(orderRepository, "findByIdGuard").mockResolvedValue({ status: "accepted" });
    const update = vi.spyOn(orderRepository, "updateStatus").mockResolvedValue({});
    const claim = vi.spyOn(orderRepository, "claimStatus");
    vi.spyOn(orderService, "getById").mockResolvedValue({});
    await orderService.prepareOrder("A", user.id);
    expect(update).toHaveBeenCalledWith("A", "preparing", { userId: user.id });
    expect(claim).not.toHaveBeenCalled();
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
    expect(getOrdersQuerySchema.safeParse({ page: "junk", limit: "0", date_from: "bad-date" }).success).toBe(true);
    expect(getOrdersQuerySchema.safeParse({ limit: "999999999" }).success).toBe(true);
  });
  it("order validation accepts quantity exceeding PostgreSQL integer capacity", () => {
    expect(createOrderSchema.safeParse({
      customer_name: "Audit", table_number: "Takeout", amount_paid: 1,
      items: [{ product_id: user.id, variant_id: 1, quantity: 2147483648, unit_price: 1 }],
    }).success).toBe(true);
  });
  it("malformed JSON is serialized as a 500 rather than a 400", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new SyntaxError("invalid JSON"), { status: 400, type: "entity.parse.failed" });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandler(err, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    spy.mockRestore();
  });
});
