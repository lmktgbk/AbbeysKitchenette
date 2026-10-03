import "dotenv/config";
import crypto from "node:crypto";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";

export async function isolatedPostgres(prefix, beforeMigration = async () => {}) {
  if (!process.env.DIRECT_URL) throw Error("DIRECT_URL required for isolated checks");
  if (!/^[a-z_]+$/.test(prefix)) throw Error("Invalid isolated schema prefix");
  const schema = `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  let db, madeSchema = false;
  async function cleanup() {
    try { await db?.$disconnect(); }
    finally { try { if (madeSchema) await admin.query(`DROP SCHEMA "${schema}" CASCADE`); } finally { await admin.end(); } }
  }
  try {
    await admin.connect(); await admin.query("BEGIN");
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`); await admin.query(`SET LOCAL search_path TO "${schema}"`);
      const entries = await readdir("prisma/migrations", { withFileTypes: true });
      for (const name of entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
        await beforeMigration(name, admin);
        const sql = (await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"))
          .replaceAll('"public"', `"${schema}"`).replaceAll("public.", `"${schema}".`)
          .replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
        await admin.query(sql);
      }
      await admin.query("COMMIT"); madeSchema = true;
    } catch (error) { await admin.query("ROLLBACK"); throw error; }
    const url = new URL(process.env.DIRECT_URL); url.searchParams.set("options", `-c search_path=${schema}`);
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 4,
      connectionTimeoutMillis: 10000, statement_timeout: 15000 }, { schema }) });
    const [state] = await db.$queryRaw`SELECT current_schema() AS schema`;
    if (state.schema !== schema) throw Error("Isolated schema not selected; writes refused");
    return { db, schema, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
