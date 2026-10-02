import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const schema = `migration_check_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  // Every object is redirected to a disposable namespace. ROLLBACK removes it,
  // including failed migrations; no public application rows are touched.
  for (const name of ["00000000000000_baseline", "20261003000000_auth_sessions"]) {
    let sql = await readFile(`prisma/migrations/${name}/migration.sql`, "utf8");
    sql = sql.replaceAll('"public"', `"${schema}"`).replaceAll("public.", `"${schema}".`);
    sql = sql.replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
    await client.query(sql);
  }
  const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND ((table_name='User' AND column_name='session_version') OR (table_name='otp_codes' AND column_name='challenge_id'))`, [schema]);
  if (columns.rowCount !== 2) throw new Error("Authentication columns missing");
  const indexes = await client.query("SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname='shifts_one_open_per_user'", [schema]);
  if (!indexes.rows[0]?.indexdef.includes("WHERE")) throw new Error("Partial shift index predicate missing");
  console.log("Baseline and authentication migration replay passed; partial index preserved.");
} catch (error) {
  console.error("Migration rehearsal failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
  console.log("Rehearsal transaction rolled back.");
}
