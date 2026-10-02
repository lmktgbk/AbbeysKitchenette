import "dotenv/config";
import pg from "pg";

// Inspect schema metadata only; never print connection credentials or customer rows.
const client = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  connectionTimeoutMillis: 10000,
  statement_timeout: 10000,
});

try {
  if (!process.env.DIRECT_URL) throw new Error("DIRECT_URL is not configured");
  await client.connect();
  const result = await client.query(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = ANY($2::text[])
     ORDER BY table_name, ordinal_position`,
    ["public", ["User", "otp_codes", "_prisma_migrations"]],
  );
  console.log(JSON.stringify(result.rows, null, 2));
  if (process.argv.includes("--verify")) {
    const columns = result.rows;
    if (!columns.some(row => row.table_name === "User" && row.column_name === "session_version") ||
        !columns.some(row => row.table_name === "otp_codes" && row.column_name === "challenge_id")) {
      throw new Error("Authentication migration columns missing");
    }
    const indexes = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1::text[])`,
      [["otp_codes_challenge_id_key", "shifts_one_open_per_user", "ingredients_name_lower_uniq", "products_name_ci_uniq"]]);
    if (indexes.rowCount !== 4 || !indexes.rows.find(row => row.indexname === "shifts_one_open_per_user")?.indexdef.includes("WHERE")) {
      throw new Error("Required unique indexes or partial predicate missing");
    }
    const invalid = await client.query(`SELECT EXISTS (SELECT 1 FROM otp_codes WHERE challenge_id IS NULL) AS invalid`);
    if (invalid.rows[0].invalid) throw new Error("OTP challenge backfill incomplete");
    console.log("Applied authentication columns, challenge backfill and custom unique indexes verified.");
  }
} catch (error) {
  console.error("Schema inspection failed:", error.code ?? "connection/configuration unavailable");
  process.exitCode = 1;
} finally {
  await client.end();
}
