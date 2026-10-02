import "dotenv/config";
import pg from "pg";

// Metadata-only verification: neither application rows nor replay results are read.
for (const name of ["DIRECT_URL", "DATABASE_URL"]) {
  const client = new pg.Client({ connectionString: process.env[name], connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  try {
    if (!process.env[name]) throw new Error("Database connection is not configured");
    await client.connect();
    const result = await client.query(`
      SELECT c.relrowsecurity AS rls,
        (has_table_privilege(c.oid, 'SELECT') AND has_table_privilege(c.oid, 'INSERT')
          AND has_table_privilege(c.oid, 'UPDATE')) AS allowed,
        (r.rolbypassrls OR (c.relowner = r.oid AND NOT c.relforcerowsecurity)) AS bypass
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles r ON r.rolname=current_user
      WHERE n.nspname='public' AND c.relname='order_requests'
    `);
    const row = result.rows[0];
    if (!row?.rls || !row.allowed || !row.bypass) throw new Error("Backend ledger permissions are insufficient");
    const publicRoles = await client.query(`
      SELECT r.rolname, has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS allowed
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE r.rolname IN ('anon','authenticated') AND n.nspname='public' AND c.relname='order_requests'
    `);
    if (publicRoles.rows.some(row => row.allowed)) throw new Error("Public role has ledger access");
    console.log(`${name}: backend ledger access and public-role isolation verified.`);
  } catch (error) {
    console.error(`${name}: verification failed (${error.code ?? "configuration/permission check"}).`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
