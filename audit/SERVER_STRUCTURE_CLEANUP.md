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

## Batch 9 — automation and ML admission readability

- Consolidated the repeated MBA analysis-query mapping inside its existing route
  file, preserving parameter order, omission rules, and URL format.
- Computed the scheduled ML-kind decision once when saving admission state.
- Documented DB-clock ownership, heartbeat renewal, atomic publication, deadline
  uncertainty, safe-generator retries, and external-outcome review in function
  comments and the automation workflow guide.
- Retained feature-specific runners and separate manual/scheduled admission
  policies; no generic job framework, migration, or provider retry was introduced.

Verification: 838 ordinary cases passed, with 119 opt-in cases skipped. All seven
report/ML PostgreSQL cases passed in a disposable schema, including fenced
automation/audit rollback and Python-backend durable effect compatibility.
Queries, lease durations, retry budgets, admission responses, and APIs are unchanged.
Hosted workers, live ML admission/timeouts, provider delivery, and production
concurrency/load remain **Not verified** for this cleanup.


## Batch 10 — anomaly and recommendation readability

- Combined identical reorder quantity-rounding branches without changing increments.
- Explained provider calls outside transactions, database-derived waste exposure,
  provider fallbacks, conditional accept/reject claims, and stale-price rollback.
- Documented pending-only replacement, preserved resolved history, and atomic
  scheduler completion. Retained separate pricing resolution because it writes prices.
- Replaced confusing anomaly comments with exact-shift, cooldown, cross-instance
  deduplication, and durable-trigger failure semantics. No rule thresholds changed.
- Added no new abstraction, feature file, schema change, or API change.

Verification: 838 ordinary tests passed; 119 opt-in cases were skipped in that run.
All 17 selected PostgreSQL cases passed across anomaly recovery, recommendation
publication, and report/ML recovery in disposable schemas. Live Gemini delivery,
hosted workers, and production load remain **Not verified**. These checks do not
establish comprehensive provider-output validation or zero regressions.
An existing formatting change in automation.repository.js was left outside this commit.


## Batch 11 — remaining server dependency boundaries

- Reviewed relative imports across 181 non-generated JavaScript source files.
  No missing relative imports or controller imports outside route files were found.
- Removed the error-handler/response-helper import cycle. AppError now lives in
  response.js; the middleware re-exports the same class to preserve callers and
  instanceof checks. Error mapping and serialization are unchanged.
- Moved utils/cloudinary.js to infrastructure/storage/imageCleanup.js and updated
  production imports and test mocks. Scheduling, URL ownership checks, and deletion
  policy are unchanged. The source-file count remains 181.
- Corrected the transaction ledger comment: page rows and totals use the same
  filters but separate reads can observe concurrent changes.

Verification: 838 ordinary tests passed, with 119 opt-in cases skipped. Source
layout checks passed; the updated static relative-import graph has no detected
cycles or missing targets. No SQL or business mutation changed, so database suites
were not repeated for this import/comment batch. Dynamic runtime dependencies,
package vulnerability status, live storage delivery, and hosted startup remain
**Not verified** by this structural check. The unrelated automation repository
formatting remains outside the commit.

### Structure to maintain

- modules/<feature>: routes declare endpoint middleware; validation declares
  input contracts; controllers translate HTTP; services own business workflows
  and transaction boundaries; repositories implement persistence.
- Add feature-named policy, pricing, output, or lifecycle files only when they
  isolate a substantial responsibility. Do not require every feature to have
  the same number of files or introduce pass-through layers.
- infrastructure: provider/storage adapters, durable effects, operational workers,
  and process health. Features call these mechanisms without moving business
  decisions into them.
- utils: broadly reused response/validation helpers and existing shared helpers.
  services/advisoryEffects.js remains the narrowly shared recommendation resolver;
  pricing stays separate because acceptance also changes a variant price.
- config: environment and client initialization; realtime: socket transport;
  middleware: Express request handling. Root shared source retains its documented
  deployment contract.
- Keep short comments on purpose and contracts; explain locks, failure outcomes,
  precision, and non-obvious calculations where implemented. Avoid narrating
  straightforward assignments or replacing actual safeguards with comments.

Next stage: inspect client feature ownership, imports, and duplicated UI/data
flows before selecting a bounded React cleanup batch. Server structural checks
are not a substitute for the final manual acceptance checklist.


## Batch 12 — broader server comment review

The earlier completion statement covered structure changes but overstated completion
of comment review. This pass inventories handwritten server sources and addresses
49 files with missing explanations or inaccurate existing comments. Comment counts
were used to locate candidates, not as proof that documentation is adequate.

- Documented auth repository projections, lockout accounting, version/hash guards,
  single-use recovery tokens, logout replay behavior, and image replacement checks.
- Explained anomaly metric definitions, sample gates, disabled-rule registration,
  percentage severity overrides, and each rule's advisory prompt purpose.
- Corrected the anomaly engine's statistical description: its mad variable is an
  average absolute distance around a median, not the standard median absolute
  deviation. The calculation and thresholds were intentionally preserved.
- Explained Sheets event identity, immutable snapshots, row allocation, ownership
  checks, rate-limit cooldowns, permanent failures, token refresh, and reset boundaries.
- Documented bounded worker sweeps, coalesced wakeups, uncertain deletion outcomes,
  readiness degradation, session queues, socket admission, and buffer limits.
- Explained validation precision/date checks and selected route authorization
  boundaries. Corrected notification comments describing nonexistent searched SQL,
  unfiltered fallback behavior, and direct creation's lack of durable retry guarantees.

Verification: normalized JavaScript syntax trees match HEAD for all 49 modified
source files (positions/comments excluded). 838 ordinary tests passed, with 119
opt-in cases skipped. No executable statement, SQL, API, threshold, transaction,
or provider retry policy changed. No migration is needed. Database suites were
not repeated for comment-only edits; live/manual acceptance remains outstanding.
The existing automation repository formatting was preserved outside this commit.

Documentation is not a blanket claim that every complex line throughout the
server has now been exhaustively reviewed. Further concrete gaps should be fixed
where found; do not treat file headers or raw comment totals as completion criteria.
