# Order and inventory follow-up recovery — M14, first rollout

Implemented 2026-10-04. M14 remains **partially addressed**: the infrastructure and order/inventory producers below are migrated, while other modules still use older best-effort hooks.

## Data flow and consistency

Business transaction → frozen `domain_effects` intent → worker transaction → audit/notification records + delivered marker.

Stock/recipe transaction → database trigger → revisioned `availability_repairs` row → authoritative batch recomputation → conditional repair removal.

- A business change and its required follow-up intent commit together. If intent storage fails, the business mutation rolls back. This adds a small database write, not an external call, to the primary transaction.
- Walk-in/online creation, fulfillment/acceptance, completion, preparation, pending edits, cancellation, item removal and loss override persist their existing audit/notification work transactionally. Existing request replay and state guards prevent duplicate intent creation.
- Ingredient creation/update/archive/restore/deletion, batch expiry edits, restock, loss and stock count persist their existing audit work transactionally. Restock and count notifications use frozen quantities. Order threshold notifications are captured inside deduction transactions rather than inferred from a later stock read.
- Shared, deterministically ordered ingredient locks protect stock before/after snapshots across managed restock, count, loss, deduction and restoration paths. Existing optimistic batch/version guards remain. Restock priority selection now commits with the restock.
- Restock and loss responses use the committed stock snapshot. Availability failure or a later stock-read outage no longer turns these committed financial writes into apparent failures. Completion audit totals come from the locked order; acceptance audit totals use the newly computed paid total.
- Database triggers capture batch quantity/ingredient changes, recipe changes and ingredient archival changes, including direct SQL writers. A newer UUID revision cannot be erased by an older repair. Manual deactivation remains respected; recipe-free variants retain their existing availability policy. Product-level availability remains a manual policy, not a derived aggregate.

## Recovery and bounds

- The worker starts with the backend and joins graceful shutdown. It polls every five seconds, processes at most 20 effect events and repairs at most 50 variants per sweep. Poll interval is not a delivery latency guarantee under backlog or database failure.
- Each effect delivery holds a PostgreSQL row lock with `SKIP LOCKED`, writes the audit/notifications and delivered marker in one transaction, and keeps a five-second transaction budget. A crash before commit rolls everything back; a committed marker prevents redelivery. Restart does not repeat order, payment, refund or inventory operations.
- Failed deliveries retry after 5, 10, 20, 40 and 80 seconds; the sixth failed attempt marks the event blocked for operator review. Retry metadata is fenced against another worker's successful delivery. Failure logs identify the event without printing its business payload. If the database itself is down, intent stays durable and later sweeps resume.
- Deleted actors are represented by a null audit relation with the original actor UUID retained in details. Notification descriptions are clipped to the existing 500-character database limit; audit details retain the business context.
- Delivered intents older than seven days are pruned in batches of 1000, at most hourly. Pending/blocked intents are retained. The actual audit and notification records have their existing retention policies.
- Availability repair uses four database operations per batch, including queue read, ordered locks, a set-based stock aggregation/update and fenced queue deletion. Shared ingredient totals are aggregated once per batch. This replaces the unused JavaScript recompute implementation.
- Realtime invalidations are best-effort after durable writes. A process exit between commit and broadcast can still lose that socket message; reconnect/refetch reads the database. One backend replica remains the deployment requirement until shared socket fanout is implemented.

## Verification

- Latest regular suite: **791 passed**; optional PostgreSQL suites are skipped by default.
- Full effects PostgreSQL suite: **16 passed**. A final targeted run passed the updated inventory flow and the additional expiry-audit case: **17 distinct PostgreSQL scenarios verified** across these runs.
- All **12 migrations** replayed in generated disposable Supabase PostgreSQL schemas; schemas were removed afterward. Tests changed no application tables.
- Coverage includes business/intent/repair rollback, repository restart recovery, concurrent worker delivery, partial-delivery failure, bounded poison-event retries, deleted actor handling, stock/recipe/archive repair, manual deactivation, revision interleaving, concurrent repair, cascaded deletion, actual order replay, actual inventory workflows, ingredient CRUD, expiry edits, outbox failure rolling back a paid order and concurrent restock ledger consistency.
- Prisma validation and local generation pass. Focused undefined/unused-variable lint checks pass for changed service implementations. No frontend changes or external-provider calls are part of this batch.
- Actual process termination mid-delivery, hosted deployment/shutdown, production permissions/backfill and representative throughput/latency remain **Not verified**. Controlled transaction rollback and repository restart tests establish narrower evidence than a hosted process-kill rehearsal.

## Rollout and operator review

Apply the additive migration before starting the new backend:

```sh
# Run from server/
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

The agent generated the local client but did **not** apply this migration to the application's schema. Do not use `db push` or reset for rollout. The migration adds queues/functions/triggers and backfills only recipe-backed repair work; it does not clear orders or stock. Retain these tables/triggers when rolling back application code; review schema rollback separately.

Operators can inspect redacted queue health with:

```sql
SELECT state, count(*), min(created_at) AS oldest_event
FROM domain_effects GROUP BY state;
SELECT count(*), min(queued_at) AS oldest_repair FROM availability_repairs;
```

After correcting a blocked delivery's cause, requeue the individually reviewed event by ID, resetting attempts and next-attempt time. Do not rerun its original sale/refund/stock mutation. This is an administrative database operation; no public replay endpoint was added. Queue backlog and blocked-event alerts still belong to M23 monitoring work.

Remaining M14 rollout: price generation/approval controllers, shift opening/closure, product/category/staff/settings mutations, authentication/security logs, reports and ML-derived actions still need producer-specific transactional capture or an explicit outcome policy. Anomaly scan hooks remain best-effort. Inventory update/status response reads and nonfinancial order detail reloads still have ordinary post-commit read failure semantics. Live acceptance remains centralized in FINAL_TESTING_CHECKLIST.md.
