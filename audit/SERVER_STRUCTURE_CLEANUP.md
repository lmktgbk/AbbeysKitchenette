# Server cleanup — batch 1

This batch relocates 15 implementations out of the broad `src/services` folder:
durable effects, image storage, ML transport/admission, process operations,
rate-limit maintenance, and feature-owned anomaly triggers. Existing filenames,
exports, transactions, queries, timeouts, and retry behavior are preserved.
Application imports and test imports/mocks follow the new paths; no forwarding
wrappers or duplicate implementations were introduced.

See `server/src/infrastructure/README.md` for responsibilities and the write flow.
The remaining services, realtime implementation, Sheets integration, and provider
configuration are intentionally deferred. This is the first structural batch,
not completion of the full server cleanup.

## Verification

- Before relocation: 826 tests passed; 117 opt-in database tests skipped.
- After relocation: 826 tests passed; the same 117 database tests skipped.
- Existing database regression files were updated to import the relocated code.
- No database schema, migration, HTTP contract, or client/ML implementation changed.
- Live browser/provider workflows and database integration execution for this
  batch: **Not verified**.

Next: review orders and inventory ownership, readability, and transaction comments
without combining structural edits with changes to business behavior.

## Batch 2 — order consumption and inventory locking

- Moved `stockLocks.js` to feature-owned `ingredients/ingredient.lock.js`; both
  order and inventory services use this one implementation.
- Expanded compressed consumption validation and settlement code without changing
  calculations, ordering, error codes, or database writes.
- Documented caller transaction requirements, lock ordering, version checks,
  original-cost settlement, and legacy restoration compatibility.
- Added `modules/orders/README.md` to explain feature responsibilities and flows.
- Retained separate order bulk deduction and inventory single-ingredient FIFO
  paths; their write shapes do not justify a generic shared framework.

Verification: 826 ordinary tests passed (117 opt-in cases skipped). The opt-in
`effects.database.test.js` suite then passed all 17 cases against a disposable
PostgreSQL schema, covering paid orders, replay, rollback, inventory changes, and
concurrent restocks. This does not verify every order race against PostgreSQL or
live browser/provider behavior. No production business data was modified.

This is a focused readability batch. Larger service decomposition, remaining
helper ownership, and broader duplication review remain outstanding.

## Batch 3 — pricing ownership and inventory list duplication

- Extracted unchanged pricing/payment methods from `order.service.js` into
  `order.pricing.js`, alongside monetary calculations. Direct object composition
  preserves existing service methods and test interception without wrappers.
- Replaced the mixed `order.utils.js` with explicit pricing and response owners;
  valid transitions now live with action policy. Removed unused status labels,
  timestamp mapping, next-status helper, and unused discount/payment constants
  after searching callers. Runtime-used item discount constants remain.
- Shared active/archived ingredient-page enrichment inside the existing service,
  preserving two batch queries and intentional absence of archived `status`.
- Kept whole-bill and per-line discount handling distinct: their input behavior
  differs, so consolidation would require an intentional behavior change.

Verification: 826 existing ordinary cases passed; two new ingredient list-contract
cases passed separately; 17 disposable PostgreSQL effects/order/inventory cases
passed. Extracted pricing method text matches the previous implementation exactly.
No schema, transaction boundary, stock query, or public HTTP contract was changed.
Live browser/provider checks and all order race scenarios against PostgreSQL remain
**Not verified** for this batch.

The services still contain substantial business workflows. This batch establishes
pricing and formatting boundaries; it does not claim all large functions or
cross-feature dependencies are resolved. Continue reviewing transaction workflows
before deciding whether further extraction improves clarity.

## Batch 4 — refund and cancellation workflow review

- Shared the identical refund-cap calculation in the existing pricing file.
  Cancellation retains its order-total limit; removal retains its net-drop limit.
  Change and prior refunds remain excluded from available tender.
- Replaced cancellation's repeated loss-list searches with a first-entry map,
  preserving selection semantics while reducing lookup work to linear time.
- Documented cancellation/removal atomicity and corrected the item-loss comment's
  field name to `order_item_id`.
- Reviewed stock restoration and inventory adjustment paths; retained legacy
  restoration and their distinct FIFO/rounding semantics rather than merging
  behaviorally different workflows. No transaction or query boundary was moved.

Verification: 828 ordinary cases passed. The existing 17 PostgreSQL cases passed;
two new settlement/rollback cases initially failed due to an incorrect test-only
Prisma delegate name. After correcting it to `paymentRefund`, both passed in a
focused rerun. These cover removal then cancellation, tender excluding change,
repeated cancellation rejection, and rollback/retry after audit-storage failure.
The database suite used disposable schemas, not production business rows.

The existing pg concurrent-query deprecation warning remains. Real browser
behavior and all concurrent cancellation/preparation races against PostgreSQL
remain **Not verified** in this batch. Larger workflows are not mechanically split
solely to reduce file length; further extraction requires a clear responsibility.

## Batch 5 — authentication ownership and comments

- Renamed session, account-lock, email-change, and effects helpers with the auth
  feature prefix. Moved database-backed OTP out of utilities into `auth.otp.js`.
- Updated HTTP, WebSocket, staff, repository, and test imports without duplicate
  compatibility wrappers.
- Documented purpose-bound challenges, one-time consumption, failed-attempt
  commits, account-first locks, public-field projections, and post-commit mail.
- Added `modules/auth/README.md` with the login and credential lifecycle.
- Preserved distinct OTP/reset/email-change policies rather than introducing a
  generic security workflow abstraction.

Verification: 828 ordinary cases passed (119 optional database cases skipped).
The auth audit-recovery and recovery-email PostgreSQL suites separately passed
20 cases in disposable schemas. A normalized diff confirmed 15 tracked JavaScript
files changed only in relative paths and comments. No credentials, token expiry,
queries, transaction boundaries, or public response contracts were altered.
Live email/browser/hosting acceptance remains **Not verified**. Shifts cleanup is
the next separate batch.

## Batch 6 — shift access and guarded closure

- Consolidated identical owner/admin read checks in a local service helper, keeping
  one lookup and the same missing/forbidden errors in each endpoint.
- Removed the unused unguarded repository `close` method after checking callers;
  `closeIfOpen` remains the close workflow's conditional write.
- Added comments and a shift workflow guide covering drawer locks, force-close
  routing, tender/change/refunds, persisted snapshots, and Manila date windows.
- Corrected an overly absolute KPI comment: separately timed requests can observe
  different committed totals even when their arithmetic agrees.

Verification: 828 existing ordinary cases passed; 10 new access-contract cases
passed separately. Shift period-statistics and pricing/shift audit-recovery suites
passed nine PostgreSQL cases in disposable schemas. No reconciliation formulas,
query order, transaction boundaries, force-close policies, or HTTP contracts changed.
Live shift/browser workflows and production load remain **Not verified**.

## Batch 7 — product and staff lifecycle review

- Indexed the locked product variant snapshot for replacement lookups and used
  a set for activation's skipped-size membership. Queries, selection order,
  transaction boundaries, and eligibility rules are unchanged.
- Added professional function/inline comments around parent/variant locks,
  availability repair, post-commit image cleanup, invitation failure, account
  edits, toggles, deletion history, and session-version rotation.
- Added feature guides for products and staff. Existing distinct bulk/single
  activation and account lifecycle policies remain explicit; no generic CRUD or
  user-management abstraction was added.

Verification: 838 ordinary tests passed, with 119 opt-in cases skipped. All 17
administrative PostgreSQL cases passed in a disposable schema, including product
history guards, image rollback, failed staff invitation, staff edit/session
rollback, toggles, and deletion history. Provider mail/image calls in this suite
are mocked; live delivery, replacement cleanup, browser behavior, and production
performance remain **Not verified**. No schema or HTTP contract changed.

## Batch 8 — categories, settings, and reporting boundaries

- Moved the existing export payload builder from the analytics controller into
  the existing analytics service. Both HTTP exports and daily-report PDFs consume
  the same implementation; reports no longer depend on an HTTP controller.
- Updated daily-report mocks and documented attachment fallback, delivery
  uncertainty, unchanged export limits, and nontransactional read snapshots.
- Clarified category deactivation's caller-owned transaction and settings
  singleton locking, cache invalidation, and existing fallback behavior.
- Corrected comments claiming reports always match independently timed app reads
  and claiming only payment changes invalidate the settings cache.

Verification: 838 ordinary cases passed, including report delivery lifecycle
checks; 17 administrative PostgreSQL cases passed in a disposable schema.
The moved export function's executable text matches its prior implementation.
No SQL, export limits, default payment policy, mutation rules, or API contract
changed. SMTP/PDF live delivery, hosted cache behavior, and browser exports remain
**Not verified**. The settings cache's all-method fallback on read failure is
documented existing behavior, not a verified successful settings read.
