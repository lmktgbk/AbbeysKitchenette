// Opt-in PostgreSQL tests use a generated namespace, never public business tables.
import "dotenv/config";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const h = vi.hoisted(() => ({ db: null, mail: [] }));
vi.mock("../src/config/prisma.js", () => ({ default: new Proxy({}, { get: (_, key) => {
  const value = h.db[key]; return typeof value === "function" ? value.bind(h.db) : value;
} }) }));
vi.mock("../src/config/env.js", () => ({ env: {
  JWT_SECRET: "isolated-database-email-test-secret-at-least-32-characters", JWT_EXPIRES_IN: "8h",
} }));
vi.mock("../src/utils/email.js", () => ({ generateOtpEmail: x => x, sendEmail: async message => h.mail.push(message) }));
vi.mock("../src/realtime/sessions.js", () => ({ revokeLocalSessions: vi.fn() }));
import { emailChange } from "../src/modules/auth/auth.emailChange.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";

const schema = `email_check_${crypto.randomUUID().replaceAll("-", "")}`;
const id = crypto.randomUUID(), password = "isolated-test-password";
let admin, madeSchema = false, hash;
describe.skipIf(process.env.EMAIL_CHANGE_DB_CHECK !== "1")("PostgreSQL recovery email transactions", () => {
  beforeAll(async () => {
    if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is required for the isolated check");
    admin = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
    await admin.connect();
    await admin.query("BEGIN");
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      await admin.query(`SET LOCAL search_path TO "${schema}"`);
      const entries = await readdir("prisma/migrations", { withFileTypes: true });
      for (const name of entries.filter(x => x.isDirectory()).map(x => x.name).sort()) {
        const sql = (await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"))
          .replaceAll('"public"', `"${schema}"`).replaceAll("public.", `"${schema}".`)
          .replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
        await admin.query(sql);
      }
      await admin.query("COMMIT"); madeSchema = true;
    } catch (error) { await admin.query("ROLLBACK"); throw error; }
    const url = new URL(process.env.DIRECT_URL);
    url.searchParams.set("options", `-c search_path=${schema}`);
    h.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 4,
      connectionTimeoutMillis: 10000, statement_timeout: 15000 }, { schema }) });
    // Raw account locks must resolve to this namespace as well as generated model queries.
    const [state] = await h.db.$queryRaw`SELECT current_schema() AS schema`;
    if (state.schema !== schema) throw new Error("Isolated search_path was not honored; writes refused");
    hash = await bcrypt.hash(password, 4);
  }, 60000);
  beforeEach(async () => {
    await h.db.user.deleteMany(); h.mail = [];
    await h.db.user.create({ data: { id, name: "Original", email: "old@example.invalid", role: "admin", passwordHash: hash } });
  }, 30000);
  afterAll(async () => {
    await h.db?.$disconnect();
    if (madeSchema) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.end();
  }, 30000);
  const start = () => emailChange.request(id, 0, "Updated", "new@example.invalid", password);
  const code = () => h.mail.find(x => x.to === "new@example.invalid").html;

  it("serializes concurrent issuance to one request and one delivered code", async () => {
    const outcomes = await Promise.allSettled([start(), start()]);
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(await h.db.emailChangeRequest.count()).toBe(1);
    expect(h.mail.filter(x => x.to === "new@example.invalid")).toHaveLength(1);
  }, 30000);
  it("permits exactly one concurrent promotion", async () => {
    const r = await start(), otp = code();
    const outcomes = await Promise.allSettled(Array.from({ length: 6 }, () => emailChange.confirm(id, 0, r.emailChange.id, otp)));
    expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(await h.db.user.findUnique({ where: { id } })).toMatchObject({ email: "new@example.invalid", sessionVersion: 1 });
    expect(await h.db.emailChangeRequest.count()).toBe(0);
  }, 30000);
  it("commits a five-guess budget across concurrent requests", async () => {
    const r = await start();
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, () => emailChange.confirm(id, 0, r.emailChange.id, "000000")));
    expect(outcomes.every(x => x.status === "rejected")).toBe(true);
    expect(outcomes.map(x => x.reason.code)).toEqual(Array(8).fill("INVALID_EMAIL_CODE"));
    expect(await h.db.emailChangeRequest.findUnique({ where: { userId: id } })).toMatchObject({ attempts: 5 });
    await expect(emailChange.confirm(id, 0, r.emailChange.id, code())).rejects.toMatchObject({ code: "INVALID_EMAIL_CODE" });
  }, 30000);
  it("rolls back a conflicting unique email without consuming verification", async () => {
    const r = await start();
    await h.db.user.create({ data: { name: "Other", email: "new@example.invalid", passwordHash: hash } });
    await expect(emailChange.confirm(id, 0, r.emailChange.id, code())).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    expect(await h.db.user.findUnique({ where: { id } })).toMatchObject({ email: "old@example.invalid", sessionVersion: 0 });
    expect(await h.db.emailChangeRequest.count()).toBe(1);
  }, 30000);
  it("rolls back identity and request deletion if later cleanup fails", async () => {
    const r = await start();
    await admin.query(`CREATE FUNCTION "${schema}".reject_cleanup() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''injected cleanup failure''; END;'`);
    await admin.query(`CREATE TRIGGER reject_cleanup BEFORE DELETE ON "${schema}".otp_codes FOR EACH STATEMENT EXECUTE FUNCTION "${schema}".reject_cleanup()`);
    try {
      await expect(emailChange.confirm(id, 0, r.emailChange.id, code())).rejects.toThrow();
      expect(await h.db.user.findUnique({ where: { id } })).toMatchObject({ email: "old@example.invalid", sessionVersion: 0 });
      expect(await h.db.emailChangeRequest.count()).toBe(1);
    } finally { await admin.query(`DROP TRIGGER reject_cleanup ON "${schema}".otp_codes`); }
  }, 30000);
  it("does not promote a request after concurrent session revocation", async () => {
    const r = await start();
    await authRepository.revokeSessions(id, 0);
    await expect(emailChange.confirm(id, 0, r.emailChange.id, code())).rejects.toMatchObject({ code: "ACCOUNT_CHANGED" });
    expect(await h.db.user.findUnique({ where: { id } })).toMatchObject({ email: "old@example.invalid" });
  }, 30000);
});
