# Financial transaction remediation — 2026-10-03

This batch implements H06 (durable order submission identity), H07 (sale/shift
closure coordination) and H08 (atomic acceptance line pricing). These are code
and schema changes, not a claim that every financial/inventory audit issue is
resolved or that full production ACID behavior has been established by testing.

## Request and response contract

The following submissions now require a random **UUID v4 Idempotency-Key header**:

- POST `/api/orders` — walk-in sale.
- POST `/api/guest/orders` — guest placement.
- POST `/api/orders/:id/fulfill` — replacement/edit and payment acceptance.
- PUT `/api/orders/:id/status` with `status: accepted` — acceptance payment.

Other status actions retain their existing contract. Missing/invalid keys return
400. The same key and normalized payload replay the original committed result;
different contents under that key return 409. Staff scopes include the current
authenticated account and action/order; guests use an unpredictable key plus
matching payload. The guest token is generated only for the winning placement
and replay returns that same tracking token. A committed placement remains
recoverable after store hours close, without admitting a new placement.

The `order_requests` primary key is `(scope,key)`. It stores a SHA-256 digest and
the small original response, not a copy of customer/payment inputs. Its row
claim, business writes and response commit in the same transaction. Conflicting
concurrent inserts wait on PostgreSQL uniqueness; rollback releases the claim.
A defensive incomplete-row check refuses another execution instead of guessing.
Responses are cached indefinitely for replay safety: do not delete old keys
without an explicit duplicate-prevention/retention design. Monitor ledger size.

Acceptance now returns the same small order-ID/order-number shape used by the
other payment actions; clients fetch order details/receipts through existing GETs.
An idempotent replay returns that original result, not a fresh current-state view.

## Atomicity and consistency boundaries

- Walk-in creation: request row, order/items, stock deductions/adjustments and
  receipt commit together.
- Guest placement: request row, pending order/items and tracking result commit
  together; placement does not claim payment or consume ingredients.
- Fulfillment: request row, guarded pending-status claim, replacement items,
  payment/discount fields, stock changes and receipt commit together.
- Acceptance: request row, pending claim, current-item revalidation, one batch
  update of all prices/subtotals/line discounts, stock, payment and receipt commit
  together. Distinct line IDs preserve different discounts on identical products.
  Unknown/duplicate discount-line references fail before settlement.
- Each payment transaction locks an open shift belonging to its account before
  order writes. Shift closure locks that same row before checking open orders
  and calculating the snapshot. Closed shifts cannot accept a new sale.

Lock order for payment is request key → shift → existing order → stock batches;
closure locks only its shift before aggregate reads. Normal closure still refuses
accepted/preparing orders. Admin force-close retains its existing note and policy.
Refunds after force-close and immutable per-item stock allocations remain separate
open financial-policy/inventory work; this batch does not certify those paths.

Post-commit notifications, audit delivery, realtime and Sheets remain outside the
financial transaction. Primary effects cannot be replayed by retrying delivery,
but durable external-event delivery/outbox work remains open (M06/M07/M14).
Database fsync/replication/backups/restore and infrastructure durability have not
been measured by this batch. ACID transaction structure alone is not recovery
or production-readiness evidence.

## Browser recovery and query performance

The browser stores a random key and digest in sessionStorage, scoped by account
and action. It coalesces overlapping identical calls into one HTTP request.
Successful responses clear the attempt; a new intentional sale gets a new key.
A network failure, timeout or 5xx retains the key. An unresolved attempt blocks
different contents rather than risking a second sale. Definitive business/input
rejections allow corrections; idempotency/pending conflicts retain the attempt.
No draft customer/payment payload is stored by this helper.

Submission HTTP waiting is bounded to 30 seconds; payment transactions retain
their 15-second timeout. A timeout is not proof of rollback: retry with the same
key. The existing guest-cart refresh issue (M22) remains open. If original details
are lost, reconcile the prior order with staff before clearing an uncertain
browser attempt; do not silently create a new key to bypass the safeguard.

Completed replay uses one indexed lookup and avoids repricing/shift/stock work.
Line acceptance uses one parameterized JSON-recordset UPDATE rather than N line
writes after commit; current-item verification uses one batched read. Narrow
shift/order row locks use existing indexes. Daily counter locking, large input
bounds and wider report/query scalability remain performance work. No p95/load
or real PostgreSQL lock-contention benchmark was run, so latency improvements
are structural changes, not measured performance claims.

## Deployment and verification

Migration `20261003010000_order_requests` is applied to the configured Supabase
database. It adds only the ledger, enables RLS and revokes public/anon/authenticated
table privileges. It does not alter existing sales/inventory/payment rows.
Backend credentials must be the table owner or an appropriately privileged RLS
bypass role; public frontend Supabase credentials must not read replay results.

- All three migrations replayed in an isolated PostgreSQL schema within a
  transaction, then rolled back; partial indexes and ledger RLS were checked.
- Migration status reports current; live database-to-Prisma diff is empty.
- Read-only metadata checks verified ledger access for both runtime/migration
  connections and denial for Supabase public roles.
- Prisma validation/client generation pass.
- **371 tests pass in 11 files** (33 additional cases in this batch). They cover
  actual order services/repositories/controllers, transactional rollback/replay,
  stale pricing snapshots, shift guards, manual payment math and browser keys.
  Database operations use an isolated serialized transactional double; real
  PostgreSQL contention and complete ledger/business-write integration remain
  **Not verified**. Existing stock-restoration cases are also retained.
- Submission/API/POS/OrdersPage lint passes. OrderingPage has the same four
  compiler-memoization lint errors and one warning as HEAD; the change introduced
  no lint diagnostics there. Full-project lint remains open.
- Frontend build passes with the existing large-chunk warning.

Deploy the updated frontend and backend together: old payment clients without
keys receive 400. Regenerate the deployment Prisma client and restart API
instances. Other installations must apply migrations before new backend code.
`node prisma/verify-ledger-access.mjs` checks metadata without reading replay rows.
`npm run db:migrate:rehearse` now replays every committed migration, then rolls back.

Final manual/concurrency/failure verification is compiled in
`audit/FINAL_TESTING_CHECKLIST.md`; no new live test sale, email or payment was sent.
