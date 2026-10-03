# Sheets synchronization remediation (M06–M07)

## Changes

Paid walk-in sales, fulfillment/acceptance, paid cancellations and item removals now persist immutable Sheets events in the same database transaction as their business writes. The worker performs no network work inside that transaction. When Sheets is disabled, no new event is recorded. Replayed payment requests reuse their committed result and do not create another event. Separate item adjustments use separate stable keys; a repeated event keeps its original snapshot.

The worker starts at boot and polls saved work instead of keeping an in-memory send chain or waiting for a nightly cron. A PostgreSQL lease keyed by service-account identity serializes replicas and enforces a 2.2-second gap across destinations. Each attempt has a 90-second database-clock lease; an expired attempt recovers its saved row and rejects stale acknowledgements. Attempts use persisted exponential backoff with jitter (five-minute ceiling); quota failures cool the sender for at least a minute. Eight failed attempts or a permanent error become `blocked`, preserving the event for operator repair. Logs use fixed codes and omit tokens, keys, customer names and Google response bodies.

Google requests, including body decoding, have ten-second deadlines and a two-MB response cap. Authentication refreshes once after 401; redirects are rejected. The OAuth token is cached with a shared in-flight refresh. The sender reads its reserved row before delivery and uses RAW PUT to the same A:L range. A lost write response or database acknowledgement is reconciled against that same event ID; it does not retry an append. Foreign data in the reserved row is blocked rather than overwritten. The underlying API operation is documented in [Google values.update](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update); read/write budgeting and backoff follow [Google usage limits](https://developers.google.com/workspace/sheets/api/limits).

The original eleven columns remain snapshots; column L stores `Sync Event ID`. These history snapshots are not an additive sales ledger: do not sum paid and subsequent adjustment rows as independent sales. The schema adds immutable identity/payload fields, row reservations, a destination allocator and shared sender leases. All new internal tables have RLS enabled without public access policies.

## Deployment and spreadsheet ownership

The migration `20261003060000_sheet_outbox` is prepared and tested in an isolated schema; it has **not** been applied to public application tables. Stop the previous backend/Sheets sender, apply pending migrations, generate Prisma Client and start the updated backend. This is not a verified rolling migration or a verified downgrade path.

Legacy synced log rows are preserved. Legacy pending rows are marked `blocked` with `LEGACY_SNAPSHOT_REQUIRED`; reconstructing their historical values from today's order state would invent evidence. Reconcile those rows manually against the existing sheet before retrying or archiving them. The migration does not modify orders, payments or inventory.

Use the `Orders` tab and dedicate column L to the event ID. An occupied unrelated L1 header blocks initialization. The first managed row begins after the existing grid capacity, preserving every old cell without downloading historical rows. This can leave a one-time blank gap. Rows/columns are only appended, never shrunk. Once initialized, do not insert/delete rows, sort the managed range in place or let other writers use its reserved rows; use filter views or a separate reporting tab. Keep the destination table when restarting or restoring the application. Resetting it against a live sheet is not safe.

Monitor `sheet_sync_log` for blocked events, high attempts, old pending entries and expired processing leases. Repair the underlying permission/header/row issue before returning a blocked event with a valid snapshot to pending. Never fabricate payloads for legacy entries. Events pin their original spreadsheet ID; changing the environment does not redirect already saved work.

## Verification

611 ordinary backend tests pass. Seven additional opted PostgreSQL checks replay all eight migrations in a generated namespace, then verify concurrent event uniqueness, transaction rollback, distinct adjustments, single sender ownership, stable row reservation, expired-lease recovery, stale-owner rejection, cooldown and RLS. The namespace is removed afterward; public business tables remain untouched. Six separate PostgreSQL recovery-email checks remain opt-in.

Loopback HTTP tests use real fetch/crypto and a stub Google service. They cover lost write response, database acknowledgement failure, repeated 401, 429, stalled headers/body, redirects, foreign rows, startup delivery and shutdown interruption. Business-service tests cover frozen snapshots and rollback of the sale/receipt/event together.

Live Google delivery, sheet permissions/capacity, public migration upgrade, hosted multi-replica operation and sustained load: **Not verified**. General automation cron deduplication (M08), unrelated post-commit effects (M14), durable image cleanup and deployment/backups/recovery (H15) remain outside this batch. Final cases are in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md).
