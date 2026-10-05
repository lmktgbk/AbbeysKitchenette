// Opt-in checks write only to a generated schema and remove it after the run.
import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import express from "express";
import http from "node:http";
import rateLimit from "express-rate-limit";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "test" } }));
import { PostgresRateLimitStore, pruneRateLimitBuckets } from "../src/infrastructure/rateLimit/rateLimit.store.js";
const schema = `deployment_check_${crypto.randomUUID().replaceAll("-", "")}`;
let admin, db, madeSchema = false;
describe.skipIf(process.env.DEPLOYMENT_DB_CHECK !== "1")("PostgreSQL deployment rate protection", () => {
  beforeAll(async () => {
    if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL required for isolated checks");
    admin = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
    await admin.connect(); await admin.query("BEGIN");
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      await admin.query(`SET LOCAL search_path TO "${schema}"`);
      const entries = await readdir("prisma/migrations", { withFileTypes: true });
      for (const name of entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
        const sql = (await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"))
          .replaceAll('"public"', `"${schema}"`).replaceAll("public.", `"${schema}".`)
          .replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
        await admin.query(sql);
      }
      await admin.query("COMMIT"); madeSchema = true;
    } catch (error) { await admin.query("ROLLBACK"); throw error; }
    const url = new URL(process.env.DIRECT_URL); url.searchParams.set("options", `-c search_path=${schema}`);
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: 10000, statement_timeout: 15000 }, { schema }) });
    const [state] = await db.$queryRaw`SELECT current_schema() AS schema`;
    if (state.schema !== schema) throw new Error("Isolated schema not selected; writes refused");
  }, 90000);
  beforeEach(async () => { await db.rateLimitBucket.deleteMany(); });
  afterAll(async () => {
    await db?.$disconnect();
    if (madeSchema) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.end();
  }, 30000);
  const store = (prefix = "fixture") => { const result = new PostgresRateLimitStore(prefix, db); result.init({ windowMs: 60000 }); return result; };
  it("concurrent replicas share an atomic counter without storing the client IP", async () => {
    const replicas = [store(), store()];
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => replicas[i % 2].increment("203.0.113.1")));
    expect(results.map(row => row.totalHits).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    const rows = await db.rateLimitBucket.findMany(); expect(rows).toHaveLength(1);
    expect(rows[0].bucketKey).toMatch(/^[a-f0-9]{64}$/);
    expect((await store("other").increment("203.0.113.1")).totalHits).toBe(1);
  }, 30000);
  it("uses database expiry, clamps decrement and resets a single key", async () => {
    const current = store(); await current.increment("client");
    await db.rateLimitBucket.updateMany({ data: { resetAt: new Date(0) } });
    expect((await current.increment("client")).totalHits).toBe(1);
    await current.decrement("client"); await current.decrement("client");
    expect((await db.rateLimitBucket.findFirst()).hits).toBe(0);
    await current.resetKey("client"); expect(await db.rateLimitBucket.count()).toBe(0);
  });
  it("saturates abusive counters rather than overflowing", async () => {
    const current = store(); await current.increment("client");
    await db.rateLimitBucket.updateMany({ data: { hits: 1000000 } });
    expect((await current.increment("client")).totalHits).toBe(1000000);
  });
  it("cleanup retains current counters and RLS protects the table", async () => {
    await store().increment("current"); await store().increment("old");
    await db.rateLimitBucket.update({ where: { bucketKey: store().key("old") }, data: { resetAt: new Date(0) } });
    expect(await pruneRateLimitBuckets(db)).toBe(1); expect(await db.rateLimitBucket.count()).toBe(1);
    const [row] = await db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE oid = 'rate_limit_buckets'::regclass`;
    expect(row.relrowsecurity).toBe(true);
  });
  it("separate HTTP servers enforce one shared budget", async () => {
    const servers = [], urls = [];
    try {
      for (let i = 0; i < 2; i++) {
        const app = express(); app.use(rateLimit({ windowMs: 60000, max: 2, store: new PostgresRateLimitStore("http-fixture", db) }));
        app.get("/", (_, res) => res.sendStatus(200));
        const server = http.createServer(app); servers.push(server);
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        urls.push(`http://127.0.0.1:${server.address().port}`);
      }
      expect((await fetch(urls[0])).status).toBe(200);
      expect((await fetch(urls[1])).status).toBe(200);
      expect((await fetch(urls[0])).status).toBe(429);
    } finally { await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))); }
  }, 30000);
});
