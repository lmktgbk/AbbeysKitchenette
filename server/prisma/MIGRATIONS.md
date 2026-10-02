# Database migration workflow

The configured Supabase database was baselined on 2026-10-03. Prisma migration
history now contains:

- `00000000000000_baseline`: the actual existing public schema, marked applied
  without executing its table-creation statements against existing tables.
- `20261003000000_auth_sessions`: the additive SEC05 authentication changes,
  applied with `prisma migrate deploy`.
- `20261003010000_order_requests`: the durable request ledger, applied on
  2026-10-03; RLS and public-role revocations protect stored replay results.

The baseline preserves native expression indexes, the partial unique open-shift
index, and existing check constraints. Supabase-managed schemas, roles, grants,
extensions and project infrastructure remain outside this migration history;
this baseline is not a database backup or complete disaster-recovery export.

## Future changes

Run commands from `server`. Keep development and production connection settings
separate: Prisma CLI uses `DIRECT_URL` from `prisma.config.ts`.

```bash
# On a separate development database only:
npm run db:migrate:dev -- --name describe_the_change
npm run db:generate
npm test

# After reviewing and committing the generated migration, on staging/production:
npm run db:migrate:deploy
npm run db:migrate:status
npm run db:generate
```

Do not use `migrate dev`, `migrate reset`, seed, cleanup, or `db push` against a
database containing production data. Development migration generation needs a
separate shadow database; configure one if the development database account
cannot create databases. Review generated SQL for dropped columns/tables and
changes to custom indexes/checks before applying it.

## Other existing installations

Do not mark the baseline applied without first comparing that installation's
schema with this baseline. For a matching pre-SEC05 installation, register
`00000000000000_baseline` with `prisma migrate resolve --applied`, then deploy.
If SEC05 was manually applied, verify its columns/defaults/index first, then
mark `20261003000000_auth_sessions` applied as well. Fresh empty PostgreSQL
databases can deploy all committed migrations normally.

Legacy BR/SEC SQL files are retained for historical reference. Future changes
belong in `prisma/migrations`; do not reapply historical standalone scripts.

## Verification evidence

- All three migrations replayed in a unique disposable schema within a transaction
  on PostgreSQL; the transaction was rolled back, including all test objects.
- Authentication columns and the partial shift-index predicate were checked
  during replay.
- The configured database reports all three migrations applied and no Prisma schema
  differences after deployment.
- The Prisma client was regenerated. Real browser/email authentication and
  account contention tests on a dedicated test database remain outstanding.

`npm run db:migrate:rehearse` repeats the isolated, rolled-back schema replay.
It requires schema-creation permission and discovers and replays every committed
migration directory. After ledger
deployment, run `node prisma/verify-ledger-access.mjs` to verify runtime access
and Supabase public-role isolation without reading application records.
