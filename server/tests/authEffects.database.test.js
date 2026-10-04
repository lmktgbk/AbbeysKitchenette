import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
const h = vi.hoisted(() => ({ db: null, mail: [], failMail: false }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_t, key) => typeof h.db[key] === "function" ? h.db[key].bind(h.db) : h.db[key] }) }));
vi.mock("../src/config/env.js", () => ({ env: { JWT_SECRET: "fixture-secret-at-least-thirty-two-characters", JWT_EXPIRES_IN: "8h", CLIENT_URL: "https://fixture.invalid" } }));
vi.mock("../src/utils/email.js", () => ({ sendEmail: async message => { if (h.failMail) throw Error("Fixture mail unavailable"); h.mail.push(message); }, generateOtpEmail: code => code, generateResetPasswordEmail: url => url, generateStaffInviteEmail: url => url }));
vi.mock("../src/utils/ipCheck.js", () => ({ isStoreIP: async () => true }));
vi.mock("../src/utils/cloudinary.js", () => ({ deleteImage: vi.fn().mockResolvedValue() }));
vi.mock("../src/realtime/sessions.js", () => ({ revokeLocalSessions: vi.fn() }));
import { isolatedPostgres } from "./helpers/isolatedPostgres.js";
import { authRepository as repo } from "../src/modules/auth/auth.repository.js";
import { authService as auth } from "../src/modules/auth/auth.service.js";
import { emailChange } from "../src/modules/auth/emailChange.js";
import { recordLoginFailure } from "../src/modules/auth/authEffects.js";
import { staffService } from "../src/modules/staff/staff.service.js";
import { generateOtp, verifyOtp } from "../src/utils/otp.js";
import { revokeLocalSessions } from "../src/realtime/sessions.js";
import { createEffectsRepository } from "../src/infrastructure/effects/domainEffects.repository.js";
let fixture, db, user, passwordHash;
const password = "Fixture-only-passphrase!";
describe.skipIf(process.env.AUTH_EFFECTS_DB_CHECK !== "1")("PostgreSQL authentication audit recovery", () => {
  beforeAll(async () => { fixture = await isolatedPostgres("auth_effects_check"); db = h.db = fixture.db; passwordHash = await bcrypt.hash(password, 4); }, 90000);
  afterAll(async () => { await fixture?.cleanup(); }, 30000);
  beforeEach(async () => {
    vi.clearAllMocks(); h.mail = []; h.failMail = false;
    await db.domainEffect.deleteMany(); await db.auditLog.deleteMany(); await db.notification.deleteMany(); await db.user.deleteMany();
    user = await db.user.create({ data: { name: "Fixture", email: "fixture@example.invalid", role: "admin", passwordHash } });
  }, 20000);
  async function block(work) {
    await db.$executeRawUnsafe("ALTER TABLE domain_effects ADD CONSTRAINT fixture_block_effect CHECK (false) NOT VALID");
    try { await expect(work()).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("ALTER TABLE domain_effects DROP CONSTRAINT fixture_block_effect"); }
  }
  async function recover() { const worker = createEffectsRepository(db); while (await worker.deliverOne()) { /* Drain this schema's intents only. */ } }
  async function otp() { const id = crypto.randomUUID(); const code = await generateOtp(user.id, id, new Date(Date.now() + 60000), false, user); return { id, code }; }
  async function issue(token = crypto.randomUUID()) { await repo.issueResetToken(user.id, token, new Date(Date.now() + 60000), 0); return token; }
  it("OTP issuance rolls back on audit failure without leaving a challenge", async () => {
    await block(otp); expect(await db.otpCode.count()).toBe(0); expect(await db.domainEffect.count()).toBe(0);
  }, 20000);
  it("OTP consumption, login timestamp and audit roll back together", async () => {
    const flow = await otp(); await block(() => verifyOtp(user.id, flow.id, flow.code, user));
    expect(await db.otpCode.count()).toBe(1); expect((await db.user.findFirst()).lastLoginAt).toBeNull();
    const results = await Promise.allSettled([verifyOtp(user.id, flow.id, flow.code, user), verifyOtp(user.id, flow.id, flow.code, user)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.user.findFirst()).lastLoginAt).toBeInstanceOf(Date);
    await recover(); expect(await db.auditLog.count({ where: { action: "LOGIN_SUCCESS" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "OTP_VERIFIED" } })).toBe(1);
  }, 30000);
  it("wrong OTP attempts still commit when the independent audit queue is unavailable", async () => {
    const flow = await otp(); const wrong = flow.code === "100000" ? "100001" : "100000";
    await block(() => verifyOtp(user.id, flow.id, wrong, user));
    expect((await db.otpCode.findFirst()).attempts).toBe(1);
  }, 20000);
  it("logout rolls back revocation on audit failure and repeated old versions add no event", async () => {
    await otp(); await issue(); await block(() => auth.logout(user.id, 0));
    expect(revokeLocalSessions).not.toHaveBeenCalled(); expect((await db.user.findFirst()).sessionVersion).toBe(0);
    expect(await db.otpCode.count()).toBe(1); expect(await db.passwordResetToken.count()).toBe(1);
    await auth.logout(user.id, 0); await auth.logout(user.id, 0); await recover();
    expect(await db.auditLog.count({ where: { action: "LOGOUT" } })).toBe(1);
  }, 30000);
  it("reset issuance cannot commit a token without its intent", async () => {
    await block(issue); expect(await db.passwordResetToken.count()).toBe(0);
  }, 20000);
  it("reset consumption rolls back and concurrent retry has one winner", async () => {
    const token = await issue(); await block(() => repo.resetPassword(token, user.id, 0, "fixture-new-hash"));
    expect((await db.passwordResetToken.findFirst()).usedAt).toBeNull(); expect((await db.user.findFirst()).passwordHash).toBe(passwordHash);
    const results = await Promise.allSettled([repo.resetPassword(token, user.id, 0, "fixture-new-hash"), repo.resetPassword(token, user.id, 0, "fixture-other-hash")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.user.findFirst()).sessionVersion).toBe(1); await recover();
    expect(await db.auditLog.count({ where: { action: "PASSWORD_RESET" } })).toBe(1);
  }, 30000);
  it("password change failure keeps sessions and hash unchanged", async () => {
    await block(() => auth.changePassword(user.id, password, "New-fixture-passphrase!"));
    expect(revokeLocalSessions).not.toHaveBeenCalled(); expect((await db.user.findFirst()).passwordHash).toBe(passwordHash);
    await auth.changePassword(user.id, password, "New-fixture-passphrase!");
    expect((await db.user.findFirst()).sessionVersion).toBe(1); await recover();
    expect(await db.auditLog.count({ where: { action: "PASSWORD_CHANGED" } })).toBe(1);
  }, 30000);
  it("profile changes roll back and stale session versions cannot modify them", async () => {
    await block(() => repo.updateProfile(user.id, { name: "Changed" }, 0));
    expect((await db.user.findFirst()).name).toBe("Fixture");
    await db.user.update({ where: { id: user.id }, data: { sessionVersion: 1 } });
    await expect(repo.updateProfile(user.id, { name: "Stale" }, 0)).rejects.toMatchObject({ code: "P2025" });
    await repo.updateProfile(user.id, { name: "Changed" }, 1); expect(await db.domainEffect.count()).toBe(1);
  }, 20000);
  it("email request cannot commit or send without its audit intent", async () => {
    await block(() => emailChange.request(user.id, 0, "Changed", "new@fixture.invalid", password));
    expect(await db.emailChangeRequest.count()).toBe(0); expect(h.mail).toHaveLength(0);
  }, 20000);
  it("email verification preserves the code and session on rollback, then recovers", async () => {
    const request = await emailChange.request(user.id, 0, "Changed", "new@fixture.invalid", password);
    const code = h.mail.find(m => m.to === "new@fixture.invalid").html;
    await block(() => emailChange.confirm(user.id, 0, request.emailChange.id, code));
    expect((await db.user.findFirst()).email).toBe(user.email); expect(await db.emailChangeRequest.count()).toBe(1);
    expect(revokeLocalSessions).not.toHaveBeenCalled();
    const confirmed = await emailChange.confirm(user.id, 0, request.emailChange.id, code);
    expect(confirmed.user.email).toBe("new@fixture.invalid"); expect((await db.user.findFirst()).sessionVersion).toBe(1);
    await recover(); const logs = await db.auditLog.findMany({ where: { action: "PROFILE_UPDATED" } });
    expect(logs).toHaveLength(2); expect(JSON.stringify(logs)).not.toContain(code);
  }, 30000);
  it("failed reset email is generic, invalidates its token and records an unconfirmed outcome", async () => {
    h.failMail = true; expect(await auth.forgotPassword(user.email)).toBeNull();
    expect(await auth.forgotPassword("unknown@fixture.invalid")).toBeNull();
    expect(await db.passwordResetToken.count()).toBe(0); await recover();
    expect((await db.auditLog.findFirst({ where: { action: "AUTH_EMAIL_DELIVERY" } })).details.outcome).toBe("unconfirmed");
  }, 30000);
  it("a delayed send failure cannot erase a newer reset token", async () => {
    const old = await issue(); const current = await issue(); await repo.discardResetToken(user.id, old);
    expect((await db.passwordResetToken.findFirst()).tokenHash).toBe(repo.hashResetToken(current));
  }, 20000);
  it("staff invitation preserves the account and records failure without leaving its link usable", async () => {
    h.failMail = true;
    const result = await staffService.createStaff({ name: "Staff", email: "staff@fixture.invalid", role: "cashier" }, user.id);
    expect(result.emailed).toBe(false); expect(await db.user.count()).toBe(2); expect(await db.passwordResetToken.count()).toBe(0);
    await recover(); const event = await db.auditLog.findFirst({ where: { action: "PASSWORD_RESET_REQUESTED" } });
    expect(event.userId).toBe(user.id); expect(event.targetId).toBe(result.staff.staff_id); expect(event.details.subjectId).toBe(result.staff.staff_id);
    expect(await db.auditLog.count()).toBe(3);
  }, 30000);
  it("failed-login capture retains only a keyed fingerprint", async () => {
    await recordLoginFailure("unknown@fixture.invalid", "INVALID_CREDENTIALS"); await recover();
    const log = await db.auditLog.findFirst(); expect(log.userId).toBeNull(); expect(log.details.account).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(log)).not.toContain("unknown@fixture.invalid");
  }, 20000);
});
