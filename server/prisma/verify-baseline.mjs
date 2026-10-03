import "dotenv/config";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { verifyConsumption } from "./verify-consumption.mjs";

const schema = `migration_check_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  // Every object is redirected to a disposable namespace. ROLLBACK removes it,
  // including failed migrations; no public application rows are touched.
  const migrations = (await readdir("prisma/migrations", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const name of migrations) {
    let sql = await readFile(`prisma/migrations/${name}/migration.sql`, "utf8");
    sql = sql.replaceAll('"public"', `"${schema}"`).replaceAll("public.", `"${schema}".`);
    sql = sql.replace(/^BEGIN;\s*$/gm, "").replace(/^COMMIT;\s*$/gm, "");
    await client.query(sql);
  }
  const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND ((table_name='User' AND column_name='session_version') OR (table_name='otp_codes' AND column_name='challenge_id'))`, [schema]);
  if (columns.rowCount !== 2) throw new Error("Authentication columns missing");
  const indexes = await client.query("SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname='shifts_one_open_per_user'", [schema]);
  if (!indexes.rows[0]?.indexdef.includes("WHERE")) throw new Error("Partial shift index predicate missing");
  const ledger = await client.query("SELECT relrowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname='order_requests'", [schema]);
  if (!ledger.rows[0]?.relrowsecurity) throw new Error("Request-ledger RLS missing");
  const emailRequests = await client.query("SELECT relrowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname='email_change_requests'", [schema]);
  if (!emailRequests.rows[0]?.relrowsecurity) throw new Error("Email verification RLS missing");
  await verifyConsumption(client);
  const leaseColumns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ('forecast_jobs','mba_jobs') AND column_name IN ('lease_owner','lease_expires_at')", [schema]);
  if (leaseColumns.rowCount !== 4) throw new Error("ML ownership columns missing");
  const jobIndexes = await client.query("SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname IN ('forecast_jobs_one_owned_running','mba_jobs_one_owned_running')", [schema]);
  if (jobIndexes.rowCount !== 2 || jobIndexes.rows.some(row => !row.indexdef.includes("WHERE"))) throw new Error("ML admission backstop missing");
  const productColumns = await client.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name='forecast_results' AND column_name IN ('product_id','legacy_product_id')", [schema]);
  if (!productColumns.rows.some(row => row.column_name === 'product_id' && row.data_type === 'uuid') || !productColumns.rows.some(row => row.column_name === 'legacy_product_id' && row.data_type === 'integer')) throw new Error("Forecast identity migration missing");
  console.log(`${migrations.length} migrations replayed; partial index and request-ledger RLS preserved.`);
} catch (error) {
  console.error("Migration rehearsal failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
  console.log("Rehearsal transaction rolled back.");
}
