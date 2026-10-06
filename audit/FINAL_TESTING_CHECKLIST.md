# SmartCafe — consolidated final testing checklist

Use this single file for the final regression pass after the remaining audit fixes
are implemented. It covers all 42 original audit findings, critical workflows,
concurrency, failures and deployment checks. Keep adding new cases to this file
as later implementation decisions change behavior.

**This is a manual acceptance checklist, not a script that runs every test.**
Some cases require developer assistance, a concurrency harness or staging failure
injection. A browser-only pass does not verify database locking or recovery.
Automated tests should still run after each code batch; the comprehensive manual
pass can wait until the remediation work is complete.

## Start the manual pass after this batch

The implementation batch is ready for acceptance testing after its pending migration is applied. This is not production approval. Read-only migration status found exactly one pending migration: `20261004010000_anomaly_trigger_kind` (internal anomaly runs plus shift opening-date index).

Confirm the destination is your intended test Supabase project, then from `server`:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
npm.cmd run db:migrate:status
```

Restart backend and ML service, and refresh/rebuild the frontend. Begin with login/OTP, POS sale → preparation → completion, cancellation/refund, stock reconciliation and shift close. Continue the detailed cases below. Record failures with X-Request-ID when available. Use separate test records/inboxes/storage/Sheets and never fault-inject into production.

Final automated evidence: 940 cases passed in the combined run, including all 117 opt-in PostgreSQL checks; three additional React draft-state cases passed separately. Frontend build/lint pass with zero warnings and all 19 Python security/worker tests pass. The current server dependency scan still reports the known Prisma configuration advisory. CI/provider hosting, alert delivery, backup restoration and representative load are **Not verified**.

## Test run record

- Date / tester:
- Branch / commit:
- Frontend / backend / ML versions:
- Test database / storage / email / Sheets environment:
- Browsers / devices:
- Start / finish:
- Overall result: NOT RUN

For every case use **PASS / FAIL / BLOCKED / NOT RUN / NOT APPLICABLE**.
Start with NOT RUN; do not mark PASS from source inspection or another case.
NOT APPLICABLE needs a reason. BLOCKED means Not verified, not passed.
Record redacted evidence (request/status, test resource IDs, row counts/quantities,
screenshot or log correlation ID), an issue reference and the retest result.
Do not put secrets, passwords, OTPs, JWTs or customer details in this file.

## Prerequisites and fixtures

- [ ] A separate test Supabase/PostgreSQL database with the same relevant schema,
  constraints/indexes and application versions. Confirm both runtime DATABASE_URL
  and migration DIRECT_URL point to that test environment before any writes.
- [ ] Separate test Cloudinary/storage, inboxes, spreadsheet and mocked external
  integrations. Fault/load tests must run only against isolated services.
- [ ] Disposable admin, cashier and kitchen accounts plus separate browser profiles.
- [ ] A reproducible seed fixture and its baseline snapshot. Reset only that fixture
  environment through the approved test process, never a production database.
- [ ] Products with multiple variants, Food/Beverages, a multi-item order, fixed and
  promotional discounts, two restock batches, low stock and expiring stock.
- [ ] Pending, accepted, preparing, completed, cancelled and removed-item orders;
  an open and closed shift; paid orders with prior refunds.
- [ ] A developer available for API replay, simultaneous-request barriers, failure
  injection, database reconciliation and infrastructure checks.
- [ ] Agree measurable performance, recovery and concurrency acceptance budgets
  before running those cases; unrecorded budgets cannot establish a PASS.

Record fixture IDs here (synthetic resources only):
Replace order labels A/B in API examples with these actual test UUIDs.
Admin: ___  Cashier: ___  Kitchen: ___  Order A: ___  Order B: ___
Ingredient: ___  Batch: ___  Variant: ___  Shift: ___
Stock before: ___  Sale consumption: ___  Expected stock after: ___

## Automated verification ? one session

Use the checked-out final commit. These commands are for PowerShell; run each
and record its exit code. A failing command is a FAIL, not permission to skip it.

~~~powershell
Set-Location -LiteralPath 'C:\Users\liamk\WebApp\AbbeysKitchenette\server'
npm.cmd run db:migrate:status
npm.cmd exec -- prisma validate
npm.cmd run db:generate
npm.cmd test
npm.cmd audit

Set-Location -LiteralPath 'C:\Users\liamk\WebApp\AbbeysKitchenette\client'
npm.cmd run lint
npm.cmd run build
npm.cmd audit

Set-Location -LiteralPath 'C:\Users\liamk\WebApp\AbbeysKitchenette\ml-service'
.\venv\Scripts\python.exe -m pip check
~~~

Python advisory scanning and real DB/browser/load suites must also run using the
final project's supported tooling; pip check checks compatibility, not known
vulnerabilities. npm audit failures require fixes or a reviewed explicit exception.
Migration status/validation/generation do not prove data integrity. No migration,
reset or seed command is intentionally included in this verification block.

Current automated evidence is recorded in CURRENT_STATUS.md and FINAL_IMPLEMENTATION_BATCH.md. Earlier batch counts are historical; they are not browser acceptance results. Automated database tests use disposable namespaces and do not establish the main database's deployed constraints or live provider behavior.

From `server`, `npm.cmd run db:migrate:rehearse` repeats disposable schema/SQL checks
and rolls back its fixtures. It requires schema-creation permission and never
modifies public application orders.

Price approval code uses the existing schema; no new migration is required.
PostgreSQL expected-price/archived-product guards and decimal-price rollback passed
with disposable fixtures. Updated price-query code passes lint. Full browser
approval/dismissal and multi-connection pricing races remain **Not verified**.

From `server`, run `node prisma/verify-ledger-access.mjs` to check ledger access
without reading business records. A schema/access check does not verify financial
transactions or replace the isolated test cases below.

## End-to-end business workflows

| ID | Steps | Expected result | Result / evidence |
|---|---|---|---|
| FLOW-01 | Login with each role; open allowed pages; call a forbidden API directly; logout and revisit a protected deep link. | Correct role access on the backend; forbidden requests write nothing; logged-out access is denied. | NOT RUN |
| FLOW-02 | Open a shift; sell a multi-line walk-in order; refresh, reprint receipt and inspect stock. | One order/receipt/deduction set; server prices and line discounts agree with totals; stock matches actual consumption. | NOT RUN |
| FLOW-03 | Place a guest order; refresh tracking; cashier edits/accepts it; kitchen prepares/checks items/completes it. | One traceable order; correct state at every screen; acceptance records stock/payment once; completion requires all active items prepared. | NOT RUN |
| FLOW-04 | Record separate cash, manual GCash and manual Maya sales; try invalid/missing required payment details. | Correct recorded method/reference, tender and change rules. No gateway transaction or webhook is expected. | NOT RUN |
| FLOW-05 | Test no discount, senior, PWD and promo on individual lines; reprint and compare reports. | Server-calculated totals and identity requirements agree across order, receipt, refund and reports; no unintended discount stacking. | NOT RUN |
| FLOW-06 | Cancel pending, accepted and preparing orders; remove an eligible item; repeat the requests; inspect declared loss/refund choices. | Correct stock reversal/loss, capped cumulative refunds and audit records; duplicate actions do not credit stock/money again. | NOT RUN |
| FLOW-07 | Restock, adjust and declare loss; reach low/out-of-stock/expiry boundaries; view menus on another device. | Batch totals, availability, alerts and adjustments reconcile; no negative or duplicate stock effects. | NOT RUN |
| FLOW-08 | Complete a shift with cash/manual payments and refunds; check daily reports and exported data across Manila midnight. | Each sale belongs to a valid shift; opening/closing balances and business dates agree with records. | NOT RUN |
| FLOW-09 | Invite/update/deactivate/reactivate staff; test reset/OTP and old sessions in another profile. | Intended role/account lifecycle and revocation; no reusable old credentials. | NOT RUN |
| FLOW-10 | Exercise search/filter/sort/pagination, empty/error/retry states, mobile layouts, keyboard dialogs, deep links and back/forward. | Correct results and navigation; no silent failures, lost state or inaccessible blocking controls. | NOT RUN |

For each flow record the resource IDs, initial/final money/stock and API outcomes.
Successful toast messages alone are not evidence of correct persisted data.

## Concurrency recipes ? real PostgreSQL required

### RACE-01 ? preparation versus cancellation

1. Create a fresh accepted test order. Record its stock consumption, payment,
   receipt and deductions. Use two operators/browser profiles.
2. Kitchen starts preparation while cashier cancels with explicit loss/refund
   choices. Repeat with cancellation first, preparation first and simultaneous
   arrival, using a fresh order each time.
3. Reopen the order in both profiles and inspect persisted status, quantities,
   reversals, cancellation, refund, loss and adjustment records.
4. Replay the stale preparation request after successful cancellation.

Expected: once cancellation succeeds, the order remains cancelled. Preparation
may succeed first and cancellation may subsequently succeed; both successes in
that valid sequence are not a failure. A later/stale preparation must fail with
409, never revive the order. Stock/money adjustments occur only once and match
the selected supported cancellation policy.

Result: NOT RUN | IDs/evidence: ___ | issue/retest: ___

### RACE-02 ? unchecking an item versus completion

1. Create a fresh preparing test order with every active item prepared.
2. Operator A completes it while B unchecks one item. Reverse the request order
   on a fresh fixture and repeat with simultaneous arrival.
3. Inspect order status and every active item's preparation state. Retry the
   losing action against the final state.

Expected: if unchecking wins, completion fails until all items are prepared. If
completion wins, unchecking fails with 409. A completed order cannot end with an
unprepared active item. Neither screen should keep a stale editable state.

Result: NOT RUN | IDs/evidence: ___ | issue/retest: ___

Run at least 20 fresh-fixture attempts per concurrency recipe. UI timing alone
cannot prove that competing writes overlapped: a developer should additionally
use two real DB connections and a synchronization barrier or controlled request
delay. If this cannot be arranged, record PostgreSQL contention as Not verified.
Do not introduce delay/failure controls into a production deployment.

## Audit-linked acceptance cases

Each original finding has a case below. Implementation labels are only the
known baseline at checklist creation: open cases describe the intended final
behavior and may currently fail. Update labels/evidence after each fix, but run
all cases on the final commit. No case below has been executed by this document.

### C01 ? Password-reset tokens authenticate as staff sessions

**Priority:** Critical

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Obtain a reset link for a disposable account. With developer assistance, submit its token as a session cookie/Bearer credential to a protected API. Repeat with expired, used, tampered and old session tokens; try WebSocket authentication too.

**Acceptance criteria:** A valid session works; reset/login-challenge, expired, tampered, legacy or revoked credentials cannot authenticate as sessions. Protected APIs reject unauthorized credentials with 401; WS admission/subscription is denied. Consumed reset links cannot reset again.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H01 ? OTP completion is not bound to a successful password challenge

**Priority:** High

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Try OTP verification/resend before password login, with another account UUID, after challenge expiry, after successful consumption, and after staff deactivation. Retry from outside the permitted staff network.

**Acceptance criteria:** Reject resend/verify without a password challenge; reject another user’s, expired, already-consumed and deactivated-account challenges. Verify staff location policy at issuance and completion.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H02 ? Sessions and established sockets survive security lifecycle changes

**Priority:** High

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Sign the same disposable account into two browser profiles and open its live dashboard. Logout in one, then repeat separately for password reset, role change and deactivation. Try API requests and observe both sockets; reactivate and retry the old credentials.

**Acceptance criteria:** Old sessions must be rejected on subsequent protected API/subscription requests. Local sockets close on revocation; idle sockets on another instance must close within the configured heartbeat bound (currently 25 seconds). Reactivation must not revive old sessions. Record observed timing.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H03 ? Order item updates ignore the parent order boundary

**Priority:** High

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Create orders A and B. PATCH /api/orders/A/items/<item-from-B> with is_prepared=true. Repeat for a removed/nonexistent item, then a valid item belonging to A. Check both orders in the database.

**Acceptance criteria:** Try item B under order A, nonexistent items, removed items, and concurrent status changes. Only an eligible item of the specified order may change.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H04 ? Kitchen role can enter the financial acceptance action

**Priority:** High

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Use admin, cashier and kitchen profiles to call PUT /api/orders/<id>/status for accepted, preparing and completed. For acceptance, use a valid payment payload. Attempt a forged body role and repeat after demoting a cashier with an open shift.

**Acceptance criteria:** Run a role-by-transition matrix through real controllers and a disposable database, including a cashier demoted to kitchen while its shift is open.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H05 ? Preparing an order can overwrite a concurrent cancellation/completion

**Priority:** High

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Execute the two concurrency recipes below using fresh fixture orders. Also try both preparation endpoints after cancellation/completion and repeat a successful preparation request. Inspect status, timestamps, actor, stock and deduction records.

**Acceptance criteria:** Follow RACE-01/RACE-02. Successful cancellation is terminal; state, stock, refunds and audit records agree. Stale/repeated preparation returns 409. Allowed preparation followed by cancellation may both succeed without violating the invariant.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H06 ? Order creation has no durable idempotency key

**Priority:** High

**Implementation:** Implemented in financial transaction batch; real PostgreSQL/browser acceptance NOT RUN

**Steps:** Capture a valid order submission with its implemented idempotency key. Replay it concurrently, interrupt the original response and retry the same key. Reuse the key with changed contents. Confirm a new intentional sale uses a different key. Repeat for walk-in, guest creation, pending fulfillment and acceptance. Replay guest creation after store closure and paid submission after shift closure. Refresh after a lost response; verify key reuse and blocking of changed unresolved details. Check manual cash/GCash/Maya totals and references without initiating online payments.

**Acceptance criteria:** Submit the same key concurrently and retry after cutting the response. Require one order, receipt and deduction set and an identical returned result.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H07 ? A sale can be attached to a shift after closure starts

**Priority:** High

**Implementation:** Implemented in financial transaction batch; real PostgreSQL/browser acceptance NOT RUN

**Steps:** Open a test cashier shift. Concurrently submit a paid sale and close that shift, in both arrival orders. Repeat with a delayed sale request; inspect the closing summary, receipt, stock and shift linkage.

**Acceptance criteria:** Barrier-test sale commit versus close with two connections. Every sale must be included in the closing balance or rejected before any stock/money write.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H08 ? Acceptance commits money and stock before per-line discounts

**Priority:** High

**Implementation:** Implemented in financial transaction batch; real PostgreSQL/browser acceptance NOT RUN

**Steps:** Accept a multi-line pending order with line-specific discounts. In an isolated environment, have a developer inject failure at the batch line update, receipt insert and ledger-response persistence. Include identical product lines with different discounts. Repeat without failure and retry the original acceptance. After rollback require pending status, unchanged stock, no receipt and no ledger claim; retry succeeds once. Race an item edit against acceptance and require a conflict instead of stale totals.

**Acceptance criteria:** Inject failure at each transaction stage. Require a complete rollback or a complete coherent committed order and a replay-safe response.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H09 ? Price approval and price change are separate unguarded writes

**Priority:** High

**Implementation:** Implemented in price approval batch; PostgreSQL guard SQL checks passed; multi-connection/browser acceptance NOT RUN

**Steps:** Approve a proposed price while another admin edits the same variant. Retry approval, approve a rejected recommendation, and inject a failure during the price write. Inspect approval status and variant price together.

**Acceptance criteria:** Force the price update to fail; test duplicate approval, rejected approval and concurrent manual editing. Require rollback or a conflict with no overwritten price.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

**Additional price regression steps:** Use isolated recommendations and variants. Race two approvals, approval versus dismissal (both arrival orders), and two recommendations based on the same original price. Change the variant manually before approval; require a stale-price conflict with the recommendation still pending. Inject failure in the status or price write and verify complete rollback. Fail regeneration insertion and require retention of prior pending suggestions. Deny cashier/kitchen direct requests, reject invalid IDs and prices, and reject archived/deleted targets. After dismissal, conflicts and lost responses, verify suggestion and product views refresh.

### H10 ? Partial stock restoration uses mutable recipes

**Priority:** High

**Implementation:** Implemented in inventory batch; PostgreSQL constraint/SQL checks passed; multi-connection/browser acceptance NOT RUN

**Steps:** Record the consumption of a test sale under recipe A. Change the recipe to B. Remove/cancel only the sold item with no loss and then declared loss using fresh sales. Reconcile restored quantities against original item/batch allocations. Include identical product lines, shared ingredients, fractional recipe quantities, multiple batches and a changed batch cost. Race two removals and removal against cancellation; repeat each request. Inject failure at settlement, stock restoration, loss, audit, refund and cancellation writes in the isolated environment. Confirm no partial changes and a successful retry. Test oversized/duplicate/unknown ingredient losses and whole-bill/per-line discount removals. Refunds must exclude cash change and never exceed original net payment. Verify the loss dialogs show original quantities, exclude removed items and preserve cents. Historical item removal, loss cancellation and cancellation after prior removals must require reconciliation without writes; untouched historical no-loss cancellation still uses original aggregate deductions.

**Acceptance criteria:** Sell an item using recipe A, change it to recipe B, then cancel/remove only that item with prepared/unprepared/loss variants. Restoration must match original actual consumption exactly.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H11 ? ML endpoints bypass the Express authorization boundary

**Priority:** High

**Implementation:** Implemented; see [ML_SERVICE_SECURITY_FIXES.md](ML_SERVICE_SECURITY_FIXES.md). Automated regressions pass; final deployed acceptance NOT RUN

**Steps:** Restart both services with matching backend-only keys. Verify an admin can start and read forecasting/MBA jobs through Express. Verify non-admin sessions are denied by Express. Break the service key and require a generic 503 without user logout. Delay headers/body past the configured deadline and require bounded failure with no overlapping watcher requests. Confirm docs endpoints are disabled and service keys are absent from frontend bundles and logs.

Call every deployed ML route directly without credentials, with invalid credentials, and with a low-privilege session. Repeat from outside the allowed network. Observe job tables to confirm denied requests create no work.

**Acceptance criteria:** From allowed and disallowed networks, request every ML endpoint without/with invalid credentials and as a low-privilege role. Require denial before job/database activity.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H12 ? ML job admission and pool initialization race

**Priority:** High

**Implementation:** Implemented; see [ML_RELIABILITY_FIXES.md](ML_RELIABILITY_FIXES.md). Isolated PostgreSQL/worker regressions pass; deployed/manual acceptance NOT RUN

**Steps:** Using a concurrency harness, send simultaneous first requests and forecast/basket job submissions to two ML workers. Kill one worker mid-job. Measure connection counts, active job uniqueness and recovery.

All six migrations are applied in the current database. Verify migration status in each deployment environment before restarting the updated service. Check that another instance starting does not reset a healthy job. Expire an owner and ensure it cannot publish; recover failed jobs without partial rows. Submit a new job after failure. Test worker deadlines and database outages.

**Acceptance criteria:** Start many simultaneous first requests and job requests across two workers. Require one pool per worker, one active job per job type, lease recovery after a killed worker, and bounded connections.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H13 ? CPU-heavy analytics execute inside async request-worker loops

**Priority:** High

**Implementation:** Implemented; see [ML_RELIABILITY_FIXES.md](ML_RELIABILITY_FIXES.md). Isolated PostgreSQL/worker regressions pass; deployed/manual acceptance NOT RUN

**Steps:** Run forecast and basket analysis on a representative large fixture dataset while continuously requesting core health/order reads. Record p95/p99 response times, CPU, memory, job duration and timeout behavior.

Confirm UUID product keys match catalog products in variant results and product scores. Verify variant quantities/revenue and ingredient needs against the same forecast. Check MBA recipe merging and pricing. Reject an invalid result mid-publication and confirm no partial completed job appears.

**Acceptance criteria:** Run forecasts and basket analysis on representative large data while probing health/list endpoints. Establish latency/memory budgets and ensure concurrent HTTP stays responsive.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H14 ? Installed dependency trees contain published vulnerabilities

**Priority:** High

**Implementation:** Dependency updates implemented; one Prisma CLI advisory remains documented. Final acceptance NOT RUN

**Steps:** Audit exact server/client lockfile dependencies and the deployed Python environment. Exercise image upload, email, requests and Prisma generation after dependency fixes. Install with npm ci and ml-service/requirements.lock. Verify product/avatar upload size limits and failure handling, real email delivery, workbook export and frontend styling after the local CSS import. Record the remaining Prisma CLI advisory and its review date.

**Acceptance criteria:** Rerun npm audit and OSV/pip-audit on exact deployed artifacts; regression-test uploads, email, Axios and Prisma generation. Require documented exceptions for residual unreachable advisories.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### H15 ? Deployment, backups and recovery have no verified release contract

**Priority:** High

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** On staging, rehearse a failed deployment and rollback. Restore a backup into a separate database and reconcile fixture orders, receipts, refunds and stock. Record restore time and the data-loss window.

**Acceptance criteria:** Rehearse deployment failure, rollback and point-in-time restore with checksums/business reconciliations. Record actual recovery time and loss window before production approval.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M01 ? Failed-login and reset-token operations are not atomic

**Priority:** Medium

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Send parallel wrong-password requests to one disposable account. Request a reset and submit it concurrently with two different passwords. Inject password-write failure on a separate run. Check counters, token consumption and the final working password.

**Acceptance criteria:** Send parallel invalid logins and parallel resets with distinct passwords; assert exact attempt counts, one reset winner and rollback on password-write failure.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M02 ? Changing the recovery email needs no independent verification

**Priority:** Medium

**Implementation:** Implemented; isolated HTTP/PostgreSQL regressions pass. New email-change migration pending; final acceptance NOT RUN

**Steps:** Attempt to change the recovery email with only an existing session. Complete the intended reauthentication/email-verification flow, then test expired verification and conflicting changes. Inspect the old and new test inboxes.

**Acceptance criteria:** A stolen session alone must not change the effective recovery address. Test pending, expired and conflicting email changes and notifications to the prior address.

**Additional regression steps:** Apply the email-change migration in the test environment first. For admin, cashier and kitchen, require the current password before code issuance; keep the prior email/name unchanged until confirmation. Test wrong passwords/account lockout, five wrong codes, expiry, cross-account and replaced request IDs, and the one-minute cooldown. Race requests and confirmations, address claims, password changes and logout. Inject credential-cleanup failure and require full rollback. Fail either issuance email and require no usable request; fail the completion notice and require the committed change to remain successful with a generic warning. Confirm old-device sessions, login codes and reset links are invalidated, and the caller gets only a replacement HttpOnly cookie. Verify the admin staff-edit route cannot bypass own-email verification. Refresh or close the modal before verification, then request a fresh code after cooldown. At desktop, mobile and short landscape heights, verify top/bottom viewport spacing, a visible title/close button/tabs, and scrolling access to every field and the Verify Email button, including with browser zoom or the mobile keyboard open.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M03 ? Malformed JSON is returned as a server error

**Priority:** Medium

**Implementation:** Implemented; actual HTTP parser regressions pass; final deployed acceptance NOT RUN

**Steps:** Send truncated JSON, invalid encoding, unsupported content types and an oversized request body to test APIs. Check response status/envelope and redacted logs; ensure the process stays responsive.

**Acceptance criteria:** Send truncated JSON, invalid encoding, an oversized body and unsupported media types. Assert correct 4xx status, a stable error envelope and no sensitive payload logging.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M04 ? Query and numeric bounds allow invalid or excessive work

**Priority:** Medium

**Implementation:** Implemented: bounded queries, calendar dates, numeric precision and collection sizes; complete paged ingredient picker. Automated regression passes; final acceptance NOT RUN

**Steps:** Exercise list filters, dates, quantities, prices and arrays with missing/null/wrong types, negatives, zero, overflow, long Unicode and duplicate lines. Try the maximum allowed value and one beyond it. Inspect that rejected requests change no rows.

**Acceptance criteria:** Exercise null/missing/type-mismatched, negative, zero, overflow, long Unicode, duplicate items and large-array cases. Reject before controller/database work with a useful 4xx response.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M05 ? Upload checks trust unanchored MIME/extension patterns

**Priority:** Medium

**Implementation:** Implemented: exact type/content validation, bounded decoding, combined product image saves, conditional replacements and reference-safe compensation. Crash-safe orphan reconciliation remains open; final acceptance NOT RUN

**Steps:** Upload spoofed MIME, double-extension, corrupt and oversized images to an isolated storage account. Try excessive dimensions, abort mid-upload and inject a database failure after upload. Check storage for abandoned assets. Verify new product images use multipart POST/PATCH; the obsolete standalone upload returns 410. Confirm a failed replacement preserves the previous image, a stale replacement returns 409 and cancelling an unsaved modal starts no upload.

**Acceptance criteria:** In an isolated storage account, test spoofed MIME, double extensions, corrupt images, huge dimensions, aborted uploads, oversize bodies and DB failure after upload. Verify definitive rejection cleanup. For unknown commit/network failures, require retained assets and a recorded reconciliation follow-up; referenced assets must never be removed.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M06 ? Repeated Sheets adjustment events conflict with uniqueness

**Priority:** Medium

**Implementation:** Implemented: atomic immutable events, stable reserved rows, PostgreSQL sender leases and bounded retries. Isolated HTTP/PostgreSQL checks pass; migration deployment/live Google acceptance NOT RUN

**Steps:** Make two separate adjustments to the same paid order. Inspect persisted sync events and the test spreadsheet. Retry each event and verify that both distinct adjustments remain represented exactly once.

**Acceptance criteria:** Perform two item adjustments to one paid order. Require two distinct persisted events and two correctly correlated external rows, with safe replay.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M07 ? Sheets sender can block forever and duplicate external rows

**Priority:** Medium

**Implementation:** Implemented: atomic immutable events, stable reserved rows, PostgreSQL sender leases and bounded retries. Isolated HTTP/PostgreSQL checks pass; migration deployment/live Google acceptance NOT RUN

**Steps:** With a stub Sheets transport, simulate hangs, repeated 401/429/500, successful append followed by DB failure, and worker restart. Observe bounded attempts, persisted status and duplicate prevention.

**Acceptance criteria:** Stub never-resolving responses, persistent 401/429/500, append-success/DB-failure and process termination. Require bounded completion, eventual delivery and one row per event. Verify the Orders tab, dedicated event-ID column L (eleven-column layout) or M (twelve-column Adjustment layout), legacy blocked rows and the managed row boundary before delivery. Preserve reserved row coordinates across retries/restarts and do not sort or insert into the managed range.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M08 ? Cron and asynchronous tasks assume a single long-lived process

**Priority:** Medium

**Implementation:** Implemented: durable scheduled runs, unique per-job/business-date admission, shared worker leases, fenced advisory publication, bounded retries and conservative external-outcome review. See AUTOMATION_RELIABILITY_FIXES.md; public migration and hosted acceptance NOT RUN

**Steps:** Run two staging replicas across a cron boundary. Kill the job owner and restart it. Inspect scheduled-run uniqueness, leases/recovery and eventual terminal status.

**Acceptance criteria:** Run two replicas, kill a worker mid-job and restart across a schedule boundary. Require one scheduled run and accurate terminal state. Expired advisory work may retry with fenced publication; uncertain email/ML submission must block for review rather than repeat automatically. Verify original report dates, same-day schedule changes, disabled schedules, bounded catch-up and migration-history blocks.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M09 ? Optional ML availability gates core API readiness

**Priority:** Medium

**Implementation:** Implemented: optional ML degradation, bounded cached DB probes, shared pool, SIGTERM/SIGINT worker and HTTP draining. Automated lifecycle tests pass; hosting acceptance NOT RUN

**Steps:** Stop only the staging ML service while PostgreSQL remains healthy. Check core readiness, login and sale paths. Separately delay a DB probe and restart the API during an in-flight fixture request.

**Acceptance criteria:** Disable ML while keeping DB healthy: sales/auth/core reads must stay ready. Hang a DB probe and in-flight request; verify bounded failure and clean deploy termination.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M10 ? Proxy, limits and environment policies are not deployment-bound

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Through the staging reverse proxy, try trusted/untrusted forwarded headers, multiple staff sharing a cafe IP, and two API replicas. Test missing required production settings and inspect cookie security/rate-limit behavior.

**Acceptance criteria:** Test trusted/untrusted forwarded headers through the actual proxy, multiple staff on one café IP, two API replicas, health probes and missing production variables. Verify secure cookies and intended rate-limit identity.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M11 ? Session JWT is returned in JavaScript-readable response bodies

**Priority:** Medium

**Implementation:** Implemented; final acceptance NOT RUN

**Steps:** Inspect password-login and OTP success response bodies, browser local/session storage and cookie attributes. Verify account switching clears the previous operator cache. Never paste real credentials or tokens into the results file.

**Acceptance criteria:** Inspect all successful login/OTP responses and browser storage. No bearer credential should appear outside the secured cookie; test cross-origin deployment only if intentionally supported.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M12 ? WebSocket admission lacks explicit resource budgets and origin policy

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Use an isolated socket load harness for hostile origins, malformed cookies, too many connections, oversized frames and repeated subscriptions. Keep a legitimate staff/guest socket open and verify responsiveness.

**Acceptance criteria:** Load-test unauthenticated sockets, oversized frames, malformed cookies, subscription floods and hostile origins. Enforce budgets while valid staff/guest tracking stays available.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M13 ? AI output is treated as trusted pricing structure

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Stub AI responses containing unknown IDs, another product variant, negative/non-finite/excessive prices, duplicates and HTML labels. Attempt applying the suggestions and inspect that invalid recommendations cannot change data.

**Acceptance criteria:** Mock output with unknown IDs, another product’s variant, negative/NaN/huge prices, duplicate recommendations and injected labels. Require rejection before persistence/application.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M14 ? Audits and derived availability can be lost after primary commits

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Fail notification, availability-refresh and audit delivery after a fixture sale commits, and kill/restart the worker. Inspect recovery/event state and menu consistency; retrying delivery must not create another sale.

**Acceptance criteria:** Fail each post-commit dependency and kill the process immediately after commit. Require recoverable events, accurate menu state and no repeated primary mutation on retry.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M15 ? Schema guarantees depend on manually applied SQL

**Priority:** Medium

**Implementation:** Migration baseline established; full fresh/upgrade verification NOT RUN

**Steps:** Provision an empty test database using committed migrations, then upgrade an older fixture. Inspect checks and expression/partial indexes; attempt duplicate names/open shifts and negative stock. Rehearse rollback without resetting real data.

**Acceptance criteria:** Create a DB from empty using the documented pipeline, upgrade an old fixture, inspect pg_constraint/pg_indexes, and run duplicate/open-shift and negative-stock attempts plus rollback rehearsals.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M16 ? Shift statistics scale with historical session count

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Load fixture shift histories of increasing size (100, 10,000, 100,000). Compare summaries with a known refund/date fixture while measuring query counts and p95 latency.

**Acceptance criteria:** Compare query counts and p95 latency at 100, 10,000 and 100,000 shifts. Results must match refunds/date rules while query count remains bounded.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M17 ? Public entry downloads a large eager application bundle

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** With cold browser cache and mobile network/CPU throttling, load guest ordering and record transferred JS, LCP and INP. Visit every lazy route, refresh its deep link and navigate back/forward.

**Acceptance criteria:** Measure cold-cache public-order startup on a low-end mobile/slow network, compare transferred JS and LCP/INP, and test every lazy route/deep link after deployment.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M18 ? POS menu realtime invalidates the wrong cache keys

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Open the POS menu on device B. On A change a variant price and deplete its stock. Verify the mounted menu on B changes without navigating or manually refreshing.

**Acceptance criteria:** With two clients, deplete stock/change price in A and verify B’s mounted POS menu updates promptly without navigation or manual refresh.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M19 ? Realtime reconnection does not reconcile events missed offline

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Disconnect B from realtime/network. Change order state on A. Reconnect B without another event. Repeat after API restart and with realtime intentionally disabled; check convergence/polling.

**Acceptance criteria:** Disconnect B, mutate orders in A, reconnect B without further changes. B must converge immediately. Repeat with realtime disabled and after server restart.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M20 ? Menu failure is displayed as a legitimate empty menu

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Use a controlled menu API fixture returning empty success, products, 503, timeout and offline failures. Check the UI distinguishes empty from unavailable and the retry button recovers without a page reload.

**Acceptance criteria:** Test 200-empty, 200-products, 401 where applicable, 503, timeout and offline mode. Error text and retry must appear only for failures and recover without reloading.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M21 ? Guest dialogs do not provide keyboard modal semantics

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Complete guest ordering with keyboard only. Open/close every dialog using Tab/Shift+Tab/Escape, inspect initial/returned focus, and use a screen reader for labels/errors. Repeat on mobile, tablet and desktop.

**Acceptance criteria:** Complete ordering entirely by keyboard at mobile/desktop sizes. Verify focus entry/trap/return, Escape, screen-reader announcement and errors, then automated accessibility checks.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M22 ? Refresh silently discards the guest cart

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Build a guest draft, refresh and navigate back/forward. Repeat in two tabs after a catalog price/availability change. Lose the order-submission response and recover the existing order without replaying it.

**Acceptance criteria:** Test refresh, back/forward, two tabs, catalog changes and lost submission responses. Recover the draft/order without replaying a payment or exposing customer details.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M23 ? Production observability is insufficiently evidenced

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Trigger representative test auth, API, DB, ML and external-service failures. Locate correlated logs/traces, dashboards and alerts. Inspect logs for passwords, bearer/reset tokens, private keys and unnecessary personal data.

**Acceptance criteria:** Trigger representative failures and confirm a traceable redacted event, dashboard signal and actionable alert. Verify no passwords, JWTs, reset links or private keys enter logs.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M24 ? Existing tests do not establish complete workflow correctness

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Run the clean automated suite and full browser workflows against isolated services. Confirm teardown, repeatability and that test configuration cannot select production data. Record unit, real DB, browser, security and load evidence separately.

**Acceptance criteria:** Execute a clean CI run from empty services with real API/DB interactions and browser workflows. Require deterministic teardown and no production configuration access.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### L01 ? Frontend lint and maintenance debt remain

**Priority:** Low

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Run full frontend lint and relevant regressions after the focused refactors. Exercise the affected pages and verify response contracts/navigation remain compatible.

**Acceptance criteria:** Require lint to pass and run business regressions after each focused refactor, preserving API contracts.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### L02 ? Operational documentation is incomplete and ignored

**Priority:** Low

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Have a developer provision an isolated environment using only committed documentation, including migrations, secrets setup, startup, rollback and restore. Record and correct every undocumented dependency.

**Acceptance criteria:** Have a developer provision a clean isolated environment using only the committed documentation and record missing steps.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

## Failure reconciliation worksheet

Use a fresh fixture for each injected failure: DB unavailable, second line write
fails, stock version conflict, dropped response, socket disconnect, email/storage
failure, Sheets timeout, ML crash, API restart and deployment interruption.
Do not simulate real payment-provider failures: GCash/Maya are manual records.

| Failure / fixture | Response / duration | State before ? after | Orders / receipts / refunds | Stock / deductions / losses | Retry result | PASS / FAIL / BLOCKED |
|---|---|---|---|---|---|---|
| ___ | ___ | ___ | ___ | ___ | ___ | NOT RUN |

A transaction failure must not leave partial money/stock/status writes. A success
whose response is lost must be recoverable without replaying the business effect.
External delivery failures must not turn a retry into a second primary sale.

## Final release decision

- [ ] All 42 audit cases and business workflows have recorded results.
- [ ] Real PostgreSQL concurrency and transaction rollback verified.
- [ ] Backend roles, token purpose, expiry/revocation and resource boundaries verified.
- [ ] Frontend navigation, responsive layouts, accessibility and retries verified.
- [ ] Payment/discount/receipt/refund/shift totals reconciled.
- [ ] Inventory deductions/restoration/loss records reconciled.
- [ ] Uploads, AI/ML, email, Sheets and background jobs verified.
- [ ] Schema constraints, migration upgrades and custom indexes verified.
- [ ] Full automated checks, dependency scans and security regressions pass.
- [ ] Performance/load budgets measured and met.
- [ ] Production configuration, proxy/TLS, secrets and socket limits verified.
- [ ] Redacted logs, monitoring and actionable alerts verified.
- [ ] Backup restoration, rollback and recovery budgets verified.
- [ ] No unresolved Critical/High defects; all exceptions have an accountable decision.
- [ ] Test artifacts cleaned up only in the isolated environment.

Release decision: NOT VERIFIED
Open defects: ___
Blocked/Not verified items: ___
Accepted exceptions and reasons: ___
Tester / reviewer / date: ___

Passing automated tests or a basic login does not establish production readiness.
Do not check off items without recorded evidence from the final tested commit.

Lifecycle implementation and rollout evidence: [DEPLOYMENT_LIFECYCLE_FIXES.md](./DEPLOYMENT_LIFECYCLE_FIXES.md). Seven additional Sheets PostgreSQL checks passed in a disposable schema; live Google delivery remains Not verified.

Live Sheets paid-order check verified on 2026-10-03: #261003003 delivered to row 1001 with correct items, total, payment, cashier and identity in M. Adjustment/outage/hosting acceptance remains NOT RUN; see SHEETS_SYNC_FIXES.md. Eight isolated Sheets PostgreSQL checks now pass.

Empty-sheet reset regression: verify headers at row 1, next new event at row 2, populated-sheet reset refusal, no replay of synced events, and preservation of concurrent-sender exclusion. Ten isolated Sheets PostgreSQL cases now pass. Actual cleared-sheet reset remains pending user clarification.

Cleared-sheet reset verified after explicit user approval: headers retained, zero data rows remain, saved nextRow is 2. Create the next real/test order to verify delivery at row 2, followed by row 3. Synced history was not requeued.

Automation follow-up: 637 ordinary tests passed; eleven isolated automation PostgreSQL checks replay all nine migrations. The implementation count from that historical batch is superseded by CURRENT_STATUS.md. See AUTOMATION_RELIABILITY_FIXES.md.

## Deployment configuration acceptance — NOT RUN

Implementation and provider setup: [DEPLOYMENT_CONFIGURATION_FIXES.md](./DEPLOYMENT_CONFIGURATION_FIXES.md). M10 proxy/shared rate protection is implemented. H15 deployment/recovery is partially addressed; actual hosting and restored backups remain Not verified. M12 origin/resource/lifecycle controls are implemented in the subsequent WebSocket batch; live/load acceptance remains outstanding.

- [ ] Apply reviewed pending migrations with `db:migrate:deploy`, generate the client during build, confirm migration status and successful production environment validation.
- [ ] Vercel deep links and refresh work; frontend API URL targets the intended HTTPS backend. No secrets appear in client assets.
- [ ] Hosted login, OTP, logout, password reset and email change work with the chosen domains in intended browsers; cookie set/clear paths, Secure/HttpOnly/SameSite and session revocation verified.
- [ ] Wrong/missing Origin and missing request marker reject mutations. Valid frontend requests and preflights succeed. Unauthorized users still cannot perform protected actions.
- [ ] Proxy IP matches the actual client; forged forwarding headers cannot bypass staff IP restrictions or rate limits. Two backend replicas enforce a shared limit and database failure returns a safe failure.
- [ ] WSS connection/reconnection works; attacker/missing production origins are rejected. Socket budgets and resync pass the acceptance cases below before public exposure.
- [ ] Backend readiness and ML `/livez` work through hosting; ML business routes and `/health` reject missing/wrong service keys. Verify actual TLS certificates and database pool budgets.
- [ ] SIGTERM, restart and failed deployment preserve pending job/order data; hosted schedules, Sheets and private ML delivery verified without duplicate execution.
- [ ] Measure request latency and capacity with shared counters, concurrent terminals and ML work; tune general request budget from recorded results.
- [ ] Verify Supabase backup retention and recover into a separate database. Reconcile financial/inventory data, migration history, outbox and automation state; record measured RPO/RTO and independent storage recovery.
- [ ] Continuous health/error/latency alerts verified; secrets remain in provider settings, not logs, client bundles or repository.

## WebSocket reliability acceptance — NOT RUN

Implementation: [WEBSOCKET_RELIABILITY_FIXES.md](./WEBSOCKET_RELIABILITY_FIXES.md). Use one backend replica until shared event fanout is verified. No migration is required for this batch. Use isolated/staging accounts and data for the following cases.

- [ ] Frontend connects to the backend WSS origin derived from VITE_API_URL; explicit override works. Wrong/missing production Origin and paths such as `/ws-other` are rejected before auth reads.
- [ ] Open the intended number of cafe terminals/tabs sharing an IP; they stay within configured budgets. Excess active/pending connections and upgrade floods are rejected; closing a socket reclaims its slot.
- [ ] Drop a connection during auth; timed-out/disconnected/late results cannot add memberships or leak slots. A healthy reconnect burst queues within the auth budget; real DB failure stays bounded and exposes no credentials.
- [ ] Malformed/null/array/binary/oversized frames, JSON/control-frame floods, too many subscriptions and excessive pending work are rejected safely. Valid subscriptions, unsubscriptions and heartbeat still work afterwards on another connection.
- [ ] Disconnect a screen, change an isolated order/stock record through a second client, then reconnect. Subscription acknowledgement refetches authoritative REST data without replaying a sale or payment.
- [ ] Log out, expire a session, disable a staff account or change its role; protected topics stop delivering. Denied staff subscriptions invoke existing REST authorization handling rather than leaving a stale screen marked live.
- [ ] Immediately log out/log in or switch accounts while the old socket is closing; old callbacks cannot close the new connection or schedule extra reconnects.
- [ ] Simulate a slow consumer and missing heartbeat; verify bounded buffers, termination and reclaimed slots. Record memory, CPU, query concurrency and revalidation time at the intended traffic level.
- [ ] Restart/SIGTERM with active sockets and pending auth; no new upgrades are accepted during drain. Reconnect completes on the new server and refreshes missed data.
- [ ] Verify one backend replica is configured. Shared event fanout must be implemented and tested before increasing replicas.

## Durable image cleanup acceptance — NOT RUN

Implementation and rollout: [STORAGE_RECOVERY_FIXES.md](STORAGE_RECOVERY_FIXES.md). Use isolated/staging records and a test Cloudinary account for failure/crash cases. Eleven isolated PostgreSQL cases passed; live provider behavior remains Not verified.

- [ ] Stop older backend/cleanup workers, apply reviewed migrations including `20261003090000_storage_assets`, generate the client and restart. Confirm migration status and worker credentials.
- [ ] Replace a product image and avatar. After a successful save, the new image works and the previous unshared asset reaches deleted state in the ledger/provider console. Allow for CDN invalidation propagation when checking the old URL.
- [ ] Reject invalid metadata or force a save failure: the previous image and database reference remain intact; a known unattached new image is cleaned after quarantine. Cancel an upload and verify late known success is tracked without a second response.
- [ ] Share an old image across isolated product/profile references, including version-equivalent URLs. Replacing one reference retains it; removing the final reference queues deletion.
- [ ] Race replacement/attachment against cleanup. A save that loses to the deletion claim receives 409; no saved record points to a deleted asset. Retry with a fresh upload.
- [ ] Simulate provider timeout/outage: saves remain responsive, deletion is fenced and retried, and no credentials or provider payloads leak into errors/logs.
- [ ] Terminate the test backend after claiming deletion and restart. Lease expiry recovers work, already-missing assets complete safely, and stale completions cannot overwrite a newer owner.
- [ ] Terminate after provider upload but before recording success. Unknown outcome becomes blocked for review; confirm identity and references before controlled resolution. Verify an operational review/alert process exists.
- [ ] External/transformed URLs and other-account assets are retained. Deleted identities cannot be reattached; no anonymous client can access the ledger.
- [ ] Measure cleanup backlog and database latency under intended concurrent upload/save load. Verify independent Cloudinary backup/recovery, since a database restore does not restore deleted files.

## Frontend loading and guest-order acceptance — LIVE NOT RUN

Implementation: [FRONTEND_RELIABILITY_FIXES.md](FRONTEND_RELIABILITY_FIXES.md). Current count: [CURRENT_STATUS.md](CURRENT_STATUS.md). Selected synthetic browser checks passed; the following real-system cases still need acceptance with isolated/staging data.

- [ ] Cold-load landing, ordering and auth pages: staff/chart chunks are not downloaded. Navigate every authorized staff page, deep-link/refresh, and use back/forward. Verify loading and failed/stale deployment chunk recovery without losing the guest draft.
- [ ] Menu loading, genuine empty, unmatched search and API failure have distinct states. Retry recovers. Search/category changes behave correctly and guest search does not issue a request per keystroke.
- [ ] In another staff session, change price/product/variant availability and categories. POS refreshes all relevant menu caches after the event and reconnect. Guest menu refreshes on focus/visible polling; new checkout always rechecks current data.
- [ ] Add items, refresh or leave/return in the same tab: intent recovers and uses current server prices. Another tab has independent edits. Expired/malformed/oversized drafts are ignored; blocked storage leaves the cart editable but refuses checkout before sending if its replay identity cannot be persisted.
- [ ] Remove/deactivate a saved product/variant or change price. Missing/unavailable items remain removable and block new checkout; changed preflight prices require review. Server still rejects/reprices stale data after preflight.
- [ ] Double-click confirmation under slow network: one order is created. Lose the confirmation, change the menu, then retry the exact original order: same order/token/total returns and its displayed quote remains the original. No changed uncertain submission can start a duplicate.
- [ ] Incomplete successful HTTP responses retain the replay key and draft. Only confirmed success clears the draft. Refresh/close during uncertain outcomes requires original details or staff verification; no customer details are persisted to bypass that policy.
- [ ] Product/cart/checkout and landing poster dialogs work by keyboard: focus entry, forward/reverse Tab containment, Escape, backdrop, return and background isolation. Variant choices and native table picker work without a mouse. Close cannot interrupt admitted submission/preflight.
- [ ] Name/table/consent validation is announced and associated with inputs. Verify screen readers, contrast and focus indicators across supported browsers.
- [ ] At phone/tablet/desktop sizes, long names/descriptions and large carts stay scrollable with reachable actions and no horizontal overflow. Verify the virtual keyboard does not obscure checkout controls.
- [ ] Measure cold/warm page loads, Web Vitals, total assets and menu payload/capacity on slow connections and representative data. The smaller main chunk alone is not a production benchmark.
# AI pricing validation acceptance — M13 (2026-10-04)

- [ ] As admin, generate for a disposable product; verify every recommendation belongs to that product and current prices/names match the database.
- [ ] Verify derived differences, percentages and direction for increase, decrease and unchanged prices; inspect margins against the captured costing context.
- [ ] Review old pending suggestions and regenerate them before approval; new validation does not retroactively establish old provenance.
- [ ] Confirm cashier/kitchen users cannot generate, apply or dismiss recommendations.
- [ ] In a mocked provider test environment, return foreign/duplicate IDs, extra fields, invalid amounts, invalid confidence, empty/overlong reasoning and malformed JSON. Verify clear errors and preservation of existing pending suggestions.
- [ ] Delay the mocked AI response, change the product's sale price/archive state, then release it. Verify 409 and no replacement of prior pending suggestions.
- [ ] Generate concurrently and race generation with approval on isolated data; verify no mixed batches, stale price overwrite or partially committed approval.
- [ ] With approved live AI usage, verify actual delivery and useful recommendations. Check provider failure/timeout handling; cancellation can still incur provider usage. Live provider behavior remains **Not verified**.
# Durable order/inventory follow-up acceptance — M14 first rollout (2026-10-04)

- [ ] Apply `20261004000000_domain_effects` through migrate deploy, generate the client and restart the backend. Confirm tables/functions/triggers exist and queue health queries work under the backend role.
- [ ] On isolated test orders, verify creation, acceptance, preparation, completion, edits, cancellation, item removal and loss overrides each preserve the correct audit/notification work. Check accepted/completed totals against committed order totals.
- [ ] Repeat the same paid-order request after a lost response; verify one financial mutation and one set of follow-up intents.
- [ ] Stop the backend immediately after an isolated business commit, restart it and verify pending work is delivered without another sale, refund or stock deduction. Actual process-kill acceptance remains **Not verified** by automated repository-restart tests.
- [ ] Inject an unavailable effect store before commit in a test schema: verify the business change, request key, stock, receipt and repair work all roll back.
- [ ] Inject a delivery failure after an audit insert and before notification/marker commit. Verify no partial delivery, later recovery and no duplicate records with concurrent workers.
- [ ] Confirm six failed deliveries block that event, preserve its intent, emit a redacted review signal and allow other eligible events to continue. Requeue only its reviewed intent after fixing the cause.
- [ ] Verify restock, loss, stock count, ingredient CRUD and expiry edits preserve audit work. Restock/loss responses must not depend on a later availability recompute or stock read.
- [ ] Race restocks, deductions and restorations on isolated stock. Verify before/after ledgers and threshold notifications reflect the serialized committed snapshots.
- [ ] Change stock/recipes/ingredient archival state, restart before repair and verify the menu converges. Preserve manual deactivation and recipe-free product policy.
- [ ] Pause a repair after its queue read, commit a newer stock change, then release it. Verify the newer revision remains recoverable and eventual availability matches current stock.
- [ ] Verify graceful worker shutdown, hosted queue recovery, production permissions/backfill and realistic backlog/load behavior. These remain **Not verified** until live acceptance.
- [ ] Record remaining modules separately: this batch does not make every audit/notification producer durable, and socket invalidations still require reconnect/refetch recovery.


## Pricing and shift durable audit recovery — 2026-10-04

Use isolated test records; never inject failures or kill processes against production transactions.

- [ ] Generate recommendations as admin, then verify one PRICE_RUN audit appears with the actor and published count.
- [ ] Apply and dismiss separate recommendations; verify one matching audit per successful action and unchanged price on dismissal.
- [ ] Race approval against dismissal and repeat approval: one resolution succeeds; stale actions return 409 without extra audit or price writes.
- [ ] Open the same cashier drawer concurrently: one succeeds, the other returns SHIFT_ALREADY_OPEN (409).
- [ ] Close the same drawer concurrently: one succeeds, the other returns SHIFT_ALREADY_CLOSED (409); committed expected/actual/variance match the response.
- [ ] Verify normal closure refuses kitchen orders; force closure remains admin-only and requires a note. Verify variance requires a note.
- [ ] In a disposable database, prevent audit intent insertion: generation, approval, dismissal, drawer opening and closure must roll back; retry after removing the injected fault.
- [ ] Stop a test backend after a successful mutation but before audit delivery, restart it, and verify the audit eventually appears once without repeating price/drawer changes.
- [ ] Verify pricing provider latency does not hold publication locks, and measure drawer closing latency on representative sales/refund history.

Live browser/process-kill/hosted load cases remain **Not verified**. PostgreSQL fixture checks do not establish production capacity.


## Product, category, staff and settings recovery — 2026-10-04

Use disposable records and a test backend. Never inject database failures into production.

- [ ] Confirm unauthenticated users receive 401 and cashier/kitchen users receive 403 for product/category/staff/settings mutations.
- [ ] Create, edit, activate, deactivate and delete test products and variants; required audit records eventually appear once per successful mutation.
- [ ] Race deactivation of the last two active variants; parent and both variants must end inactive. Verify manual deactivation remains after availability repair.
- [ ] Replace variants with an ID from another product or a deleted variant: receive VARIANT_CHANGED (409), without creating a replacement or modifying the other product.
- [ ] Products with order history cannot be deleted; referenced variants cannot be renamed and are manually deactivated when removed from the replacement payload.
- [ ] Activate with sufficient stock, insufficient stock and archived ingredients; verify response summaries and recovered availability.
- [ ] Replace and delete images: successful changes eventually clean old assets; rejected/conflicting/rolled-back changes keep the current image.
- [ ] Deactivate a subcategory containing several products: category, products, variants and audit intent must commit or roll back together.
- [ ] PATCH subcategories with malformed/out-of-range IDs: receive 400 before business writes.
- [ ] Save settings concurrently on an empty test database: no duplicate-key error. Identical saves produce one audit/notification; omitted fields remain untouched.
- [ ] Update staff role/email/active state and verify session invalidation only follows committed changes. Verify duplicate email conflicts and self-email verification restrictions.
- [ ] Toggle the same staff member concurrently: both successful toggles are reflected in session versions and their audit/notification records.
- [ ] Staff with drawer, order, stock, refund or recorded actor history cannot be deleted; use deactivation instead.
- [ ] Invitation delivery failure reports emailed=false while preserving the created staff account. External email delivery/recovery remains Not verified.
- [ ] In a disposable schema, block domain-effect insertion; verify every tested product/category/staff/settings mutation rolls back without image deletion or premature session revocation. Remove the injected fault and retry.
- [ ] Stop a test backend after mutation commit and before follow-up delivery; restart and verify audit/notification recovery without repeating the business change.
- [ ] Measure 50-variant edits and large subcategory deactivation against representative test data; five-second transaction limits are ceilings, not measured service latency.

Actual browser, process-kill, provider delivery and representative load acceptance remain **Not verified**.


## Authentication and invitation recovery — 2026-10-04

Perform destructive failure injection only in disposable schemas and test processes.

- [ ] Login and resend create OTP_REQUESTED audits; a successful OTP creates one OTP_VERIFIED and one LOGIN_SUCCESS audit after consuming the code and updating last-login.
- [ ] Submit the same valid OTP concurrently: one succeeds; no duplicate successful-login audits or sessions are created.
- [ ] Block audit-intent insertion in a disposable schema: valid OTP consumption, password change/reset, logout, profile/avatar update and email-change request/confirmation must roll back.
- [ ] After removing the injected failure, retry the pending code/token/action; verify one successful mutation and matching audit.
- [ ] Wrong OTP attempts continue to count while the independent audit queue is unavailable; failed-login audit capture failure must never grant access.
- [ ] Repeat logout with the old session version: no additional version increment or LOGOUT audit.
- [ ] Issue and consume a reset link; verify old sessions and unused challenges become invalid and replay is rejected.
- [ ] Delay an old recovery email failure until after a newer token is issued: cleanup must preserve the newer token.
- [ ] Simulate reset mail failure: receive the same generic response as an unknown/inactive address; its token is invalidated if storage is available.
- [ ] Create staff with successful and failed mail delivery; account creation remains committed, failure reports emailed=false, and invitation audit identifies admin actor and staff subject.
- [ ] Failed delivery marks AUTH_EMAIL_DELIVERY outcome as unconfirmed; successful SMTP acceptance is provider-accepted, not proof of inbox receipt.
- [ ] Inspect intents, audit records and warnings: no passwords, password hashes, raw tokens, OTPs, email HTML, or submitted failed-login addresses. Failed-login correlation is a keyed fingerprint.
- [ ] Verify recovery-email request/confirmation retains all existing cooldown, attempt-limit and account-version guards.
- [ ] Attempt profile/avatar edits after session revocation: stale session versions must not modify the account or remove its current image.
- [ ] Kill a test process after issuance but before/after SMTP: issuance audit remains recorded; uncertain delivery must not automatically resend or create a session. Request a new code/link through the ordinary guarded flow.
- [ ] Kill a test process after a successful account change but before audit delivery, restart and verify durable audit recovery without repeating the credential change.
- [ ] Verify live inbox delivery, expired links, multiple browser tabs and hosted cookies/WebSockets using test accounts.

Live inbox receipt, process-kill/provider ambiguity, hosted behavior and load remain **Not verified**. If cleanup storage is unavailable after a mail failure, the code/link remains bounded by its expiry and account version; do not assume immediate invalidation succeeded.

## Report and intelligence recovery

- [ ] In a disposable schema, reject audit-intent insertion: reorder/waste generation retains the previous pending batch; accept/reject retains pending status.
- [ ] Race accept against reject on the same suggestion: one succeeds, the other returns 409; one resolution audit is delivered.
- [ ] Run competing generations: the pending list contains one complete batch rather than mixed results.
- [ ] Generate high-severity anomalies: notifications reference existing finding IDs; repeat acknowledgement creates no additional acknowledgement audit.
- [ ] Interrupt a report before SMTP: no unrecorded send starts. Interrupt after SMTP: review recipient outcome manually before retrying; never infer inbox delivery from provider acceptance.
- [ ] Fail report outcome capture: subsequent recipients are not sent; inspect redacted attempts and outcome stages.
- [ ] Fail manual ML attempt capture: no external admission occurs. Drop its response: check job history before submitting again.
- [ ] Stop the backend audit worker while ML completes: restart it and verify lifecycle audits recover without rerunning the ML job.
- [ ] Reject lifecycle intent insertion in a disposable schema: job completion rolls back; retry under the valid lease produces one completed audit.
- [ ] Verify market-basket combo publication and its audit together through the actual ML endpoint.
- [ ] Verify scheduled completion audit recovery, live report inbox receipt, actual forecast/MBA results and hosted service connectivity.

Live integrations, anomaly trigger recovery/concurrency, process-kill behavior and load remain **Not verified**. This batch needs no new migration; restart backend and ML service.


## Final batch acceptance — shifts, anomaly recovery, frontend and operations

- [ ] Compare shift KPI totals against individual summaries for cash, manual GCash/Maya, paid cancellations, partial refunds, empty shifts and closed variance. Include inclusive opening/closing timestamps.
- [ ] Increase history in an isolated fixture and measure realistic latency against the agreed budget; query count is one, but this is not proof of production throughput.
- [ ] Stop/restart the test backend after an order completion/loss/shift-close commit but before audit delivery; confirm the durable anomaly trigger recovers without repeating the original mutation.
- [ ] Race manual and queued scans: one finding for the same rule/day or exact shift; its notification references that persisted finding.
- [ ] Reject anomaly publication/audit capture in staging: no partial findings; queued work retries, expired owners cannot publish, exhausted retries are visible as blocked work.
- [ ] Change a list filter from a later page: page resets before the new query/display. Check product, demand and ingredient lists.
- [ ] Edit filter/date/time/terminal settings drafts, close/reopen and confirm their saved values are restored without stale draft state.
- [ ] Replace/remove a product preview, close/reopen and edit another product: correct preview/file is submitted; saved replacement still deletes the prior provider image through durable cleanup.
- [ ] Change loss ingredients rapidly with a slow network: stale batch responses cannot overwrite the current ingredient's options.
- [ ] Start forecast/MBA work: submission/loading/progress prevents repeat submission; completed/failed/missing job state releases the button and clears browser job persistence appropriately.
- [ ] Verify settings section buttons, form validation/subscribed fields, staff roles, stock counts and combo price recalculation after frontend cleanup.
- [ ] GET /api/operations/metrics without a session returns 401; cashier/kitchen returns 403; active admin returns no-store metrics.
- [ ] Trigger a staging 500 containing synthetic sensitive text: response is generic; production log has request correlation without the raw message, URL query, cookies or tokens.
- [ ] Observe blocked effects/anomaly/storage and oldest backlogs; configure and test hosted alerts. Do not place session tokens in public dashboard or monitor URLs.
- [ ] Run the GitHub workflow on the final commit. Its dependency gate remains blocked by the documented Prisma advisory until resolved/reviewed; do not report a green security gate from local tests.
- [ ] Perform the onboarding/backup/restore/rollback exercise in OPERATIONS_RUNBOOK.md and record recovery time/data reconciliation.
# Shared-source deployment acceptance

- [ ] Vercel includes source outside its `client` Root Directory and builds successfully.
- [ ] Backend artifact retains sibling `server/` and `shared/` directories.
- [ ] `npm --prefix server run check:source` passes inside the backend artifact.
- [ ] A shared-only change triggers both frontend and backend deployment.
- [ ] ML deploys independently from `ml-service` and backend startup/health succeeds.

Local frontend build and backend import/missing-folder checks passed. Hosted
builder detection, deployment triggers, and artifact startup remain **Not verified**.
See [shared-source deployment settings](SHARED_SOURCE_DEPLOYMENT.md).

## Client structural cleanup — final browser acceptance

- [ ] Open every role-accessible route; refresh a deep link and use browser back/forward.
- [ ] Check dashboard KPIs/charts/date filters/exports and forecasting job selection, chart selection, product demand and ingredient ordering tabs.
- [ ] Switch operators, logout, reconnect realtime and reopen another tab; verify access and displayed data belong to the current operator.
- [ ] Recover a guest cart after refresh; change menu prices/availability; submit with a lost response and retry the same order; check confirmation/tracking.
- [ ] Test POS cash tender/change, manual GCash/Maya references, per-line senior/PWD/promo discounts, modal reopen, and unavailable/loading order lines; reconcile receipts.
- [ ] Add/edit ingredients; close/reopen drafts; test empty, zero, negative and fractional thresholds and saved unit restrictions.
- [ ] Add/edit a product with variants/recipes; replace/remove its image, cancel a draft, switch products and verify old stored assets are cleaned up only after successful saves.
- [ ] Check mobile/desktop layouts, modal overflow, keyboard interaction, loading/error/empty states and browser console errors after unused-component removal.

Local cleanup checks on 2026-10-05: production build and lint passed; 234 source
files reachable with no missing relative/alias imports or cycles; 838 tests passed,
119 skipped, including 52 passing client-focused cases. The checks above remain
**NOT RUN** for this structural cleanup. Record results with the commit tested.

## Confirmation dialog security regression

Use isolated local/test records; cancel each dialog without performing deletion
or deactivation. Never use production business records for these fixtures.

- [ ] Give a test product the harmless name `<b>test-name</b> & Café 🧋`; open deactivate/delete confirmation. Tags and ampersand must display literally, with no bold name or injected elements.
- [ ] Check ordinary product/variant names containing apostrophes and quotes; messages remain readable and static note layout remains intact.
- [ ] Verify reason chips retain their selected values and cancellation returns to the original screen without submitting an action.
- [ ] Verify regular confirmation success/failure behavior on isolated fixtures and ensure no browser console errors.

Automated renderer-contract regressions: six passed on 2026-10-05. Live cases
above remain **NOT RUN**; record the tested commit and browser.

## Calendar and modal lifecycle regression

- [ ] On Manila and overseas devices, select dates and all presets; verify request dateFrom/dateTo match visible calendar labels across month/year/leap-day boundaries.
- [ ] In profile, staff, inventory, category, pricing, and filter dialogs, check initial focus, Tab/Shift+Tab containment, Escape/backdrop dismissal, and restoration to the opener.
- [ ] Open a nested dialog, close it, and verify the parent still blocks background scrolling and remains interactive.
- [ ] Use time filters inside FilterModal; open category/pricing confirmations inside their dialogs. Verify child controls remain clickable and the parent stays open.
- [ ] On a small viewport, verify long forms remain scrollable with top/bottom spacing and profile header/tabs remain visible.

Isolated browser controls passed on 2026-10-05: focus loop/restoration, Escape,
backdrop, nested modal scroll lock, time/date picker use, and literal confirmation
text. Five automated timezone serialization cases passed. Full application and
mobile cases above remain **NOT RUN**.

## ML-service cleanup acceptance

- [ ] Verify the deployment/local Python environment can import pinned requirements and start the service; the local existing venv launcher currently points to a missing interpreter.
- [ ] Submit an admin forecast and MBA analysis; repeat while running and verify both clients attach to the same job.
- [ ] Verify job progress, completion/failure state, forecast UUID grouping, variant quantities, ingredient needs, and MBA recipe/pricing output.
- [ ] Check expired-owner recovery and shutdown on staging fixtures; confirm stale workers cannot publish and partial failures do not leave completed results.

First cleanup batch: eight isolated auth/pool/admission tests and eleven worker
reliability tests passed on 2026-10-05, including synthetic spawned model work.
Deployment, real database regressions for this pass, and live acceptance above
remain **NOT RUN**. No schema migration was introduced.

### Forecast response assembly regression

- [ ] Reconcile each ingredient's displayed daily need with forecast variant units multiplied by its current recipe; verify per-day rounding, total, current stock, coverage and critical/warning/ok status.
- [ ] In an isolated fixture, change a recipe after a forecast and verify that its ingredient view uses the current recipe rather than a historical recipe snapshot.
- [ ] Verify missing recipes/stock, empty jobs, skipped products, and missing job IDs are handled without phantom ingredient quantities.
- [ ] Verify history and selected results agree on timestamps, period, status and product counters; total_variants remains a legacy product-group count.

Forecast cleanup: nine new isolated regression cases and 19 existing ML cases
passed; 60 seeded response comparisons matched the earlier implementation.
The live acceptance cases above remain **NOT RUN**.

### Market-basket cleanup regression

- [ ] Run a fresh analysis and verify product/size identities, recipe quantities, ingredient units, costs, support/confidence/lift and stability display.
- [ ] Check a fixture with recipe cost 31 and menu prices 15+15: minimum price 32, suggested price 35. Normal cost-2 and prices-10+20 suggestions remain 25 at 15% discount.
- [ ] Verify a new recommendation uses the corrected floor; old saved analysis/product prices remain unchanged until an explicit new analysis/edit.
- [ ] Confirm running jobs do not expose unpublished rules, missing IDs return the expected error, and database outages surface an error rather than an empty successful result.
- [ ] Create an isolated combo and verify its association/audit capture. Product save and association remain separate requests; check partial failure recovery.

Fourteen isolated MBA cases plus 28 existing ML cases passed on 2026-10-05.
Seeded detail/pricing comparisons and SELECT/parameter comparison also passed.
Live cases above and real PostgreSQL query execution remain **NOT RUN** for this
batch; no schema migration was introduced.
## Product image guidance and preview regression (2026-10-05)

Layout follow-up (2026-10-06): product name/category/description now share the
left column; the square image preview is bounded to 180 px in the right column.
Image guidelines appear in a full-width note below both columns, with maximum
dimensions/cropping inside native expandable More details. Mobile stacks columns.
Recheck keyboard upload/remove, expandable details, long field errors and narrow
screen layout. Image-selection policy and upload/cleanup workflow are unchanged.
Fourteen focused image policy/transport tests passed; client lint/build passed.
Actual browser/mobile appearance remains **Not verified** in this follow-up.

Placement refinement (2026-10-06): the note now sits directly below the upload
preview in its 180 px column, using compact desktop typography and normal mobile
helper text. Collapsed guidance is intended to end near the description; expanded
details grow naturally. Recheck actual alignment, browser zoom and keyboard
expansion. Upload policy and data flow remain unchanged.

- [ ] Product form explains JPG/JPEG, PNG, WebP and GIF, maximum 5 MB,
  recommended square 1000 × 1000 px, maximum 4096 pixels per side and card cropping.
- [ ] Select portrait/landscape/square images: the preview stays in a square frame,
  bounded to 180 px, and matches product cards' cover cropping. Check mobile too.
- [ ] A file over 5 MB, empty file, unsupported extension or mismatched MIME type
  shows an inline error without replacing the existing saved/draft image.
- [ ] Select the same rejected file again: the input can report the error again.
  Picker cancellation preserves the current image.
- [ ] Upload/replace/remove controls work with keyboard and touch; removal does
  not reopen the picker. Saving and old-image cleanup follow the existing workflow.
- [ ] Backend still rejects corrupt bytes, disguised file content and oversized
  decoded dimensions even if browser preflight is bypassed.

Verification: 34 focused frontend image-policy/transport and backend decoded-image
and upload integration tests passed. Browser checks do not prove authentic content;
decoded validation remains server-owned. Client lint/build passed. Visual cropping,
mobile layout and live Cloudinary replacement/deletion remain **Not verified** in
this batch. No backend policy, database schema or provider workflow was changed.

## Product bulk visibility regression (2026-10-05)

The retained policy is stock-checked activation: individual activation rejects
insufficient ingredients; bulk activation activates eligible variants and reports
skipped sizes. A manually disabled skipped size stays disabled after restocking.
Automatic stock unavailability can recover after restocking if not manually disabled.

- [ ] Open a product with one available and one manually disabled variant: both
  Activate All and Deactivate All are visible and actionable.
- [ ] All variants active: Activate All is disabled. All manually disabled with
  the product disabled: Deactivate All is disabled. Loading/empty details cannot
  submit bulk variant actions.
- [ ] Deactivate All: confirmation stays visible; confirm persists parent and all
  variant deactivation after refresh. Cancel keeps the detail modal open.
- [ ] Activate All with mixed stock: eligible sizes activate; the warning names
  skipped sizes. Nothing forces a low-stock or archived-ingredient variant active.
- [ ] Try individual activation with insufficient ingredients: the backend error
  remains visible. Restock a manually disabled skipped size and confirm it remains
  disabled until explicit activation succeeds.
- [ ] A size unavailable only because of stock automatically recovers after stock
  replenishment and availability repair; Deactivate All prevents that recovery.
- [ ] Product deletion confirmation also remains mounted until its action finishes;
  cancellation/failure preserves the details. Expansion and variant action controls
  are separate keyboard buttons.

Verification: 872 ordinary regression tests passed, 121 skipped; nine new component
callback/visibility checks passed within that suite. Three opt-in PostgreSQL tests
passed in a created-and-removed disposable schema: mixed-stock activation/rollback,
manual restrictions after restocking, automatic stock recovery, archived-ingredient
rejection and queued availability repair. Production business rows were not modified.
Client lint and production build passed. Actual browser confirmation/focus behavior
and full POS/guest visibility after refresh remain **Not verified** in this batch.

## OTP resend feedback regression (2026-10-05)

- [ ] After password login, resend shows a one-minute countdown; verification
  remains available while only resend is cooling down.
- [ ] After the countdown, resend once: a new email arrives, another countdown
  begins, and the delivered code completes login. Resend does not extend the
  original ten-minute challenge expiry.
- [ ] A rejected resend shows the actual server message, not only "Failed to
  resend OTP". Cooldown responses include remaining seconds in JSON and Retry-After.
- [ ] In isolated testing, exhausting the shared auth budget blocks both verify
  and resend until its remaining retry deadline. Do not bypass server limits.
- [ ] An expired/revoked challenge shows the reason and "Sign in again" returns
  to the correct portal's password form.
- [ ] An unavailable API reports a connection problem; successful delivery and
  interactive browser timing remain **Not verified** by automated tests alone.

Automated verification: 863 tests passed, 119 skipped. New tests cover remaining
cooldown timing without database mutation, replacement delivery with preserved
expiry, shared limit timing, expired challenges, backend message retention,
malformed retry values, network feedback and background-tab clock catch-up.
HTTP tests use in-memory fixtures; no production database or email was used.

# Final ML integration review (2026-10-05)

- Automated baseline: 854 Vitest tests passed, 119 skipped; client build/lint,
  source-layout check, 42 Python regressions and 22 ML source compilations passed.
- Isolated PostgreSQL ML reliability checks passed using a disposable schema;
  no public business rows were modified. Hosted behavior remains **Not verified**.
- [ ] Verify the current POST market-basket analysis flow in the browser, including
  refresh/reconnection, completion and failed-job recovery.
- [ ] Resolve the legacy GET `/api/market-basket/analyze` contract before relying
  on it: its upstream Python route accepts POST only. Current UI uses POST.
- [ ] Review the maintained holiday inputs against actual operating days and
  official dates; calendar completeness and model accuracy are **Not verified**.
- [ ] Repair/recreate the local ML virtual environment before using its launcher;
  automated checks used compatible bundled Python with existing packages.

## Product image automatic resizing (2026-10-06)

Static JPG/PNG/WebP images larger than 1000 pixels per side are resized in the
browser with their proportions preserved. No permanent square crop is applied.
The original selection must remain within 5 MB, 8192 pixels per side and 32
megapixels. Animated GIF/WebP/APNG bytes are preserved; oversized animations
require external resizing rather than silently losing frames. The backend
continues to decode, sanitize and enforce its independent processing limits.

- [ ] Select a large static image: preparation finishes, a resize notice appears,
  and the saved product displays the image. Cards crop the display only.
- [ ] While preparation is running, saving (including Enter) cannot submit the
  unfinished selection. Remove/close does not restore a late decoded image.
- [ ] Small static images and permitted animations retain their original bytes
  during browser preparation. Animation remains present after saving.
- [ ] Corrupt images show a decoding/content error. Direct oversized API uploads
  return IMAGE_DIMENSIONS_EXCEEDED rather than reporting corruption.
- [ ] Invalid replacements preserve the previous draft/saved image; successful
  replacements continue using the existing durable old-asset cleanup workflow.

Verification: 896 automated tests passed, 121 skipped; client lint and production
build passed. The supplied 5062 x 4824 PNG was processed in a real browser into
1000 x 953 pixels (129777 bytes) and accepted by the actual backend sanitizer
(96415 sanitized bytes) through an isolated local harness. No database or
Cloudinary writes occurred. Full live product saving/provider cleanup remains
**Not verified** by this harness.

## Product create/edit image draft isolation (2026-10-06)

Starting Add and successfully finishing Edit clear the prior edit query identity.
Create mode receives no saved product details and initializes its image preview
empty even if a caller supplies stale cached details. Upload processing and
stored-asset cleanup remain unchanged.

- [ ] Edit a product image and save; immediately open Add. No previous image,
  file, product metadata or variants appear in the new draft.
- [ ] Close Add and reopen; its image stays empty. Edit another product and
  verify only that product's saved image appears.
- [ ] Cancel an image replacement and open Add; the old draft is not submitted.

Verification: 30 focused draft/image tests passed. The real form was rendered in
Edit then Add with cached details deliberately retained; Add's preview was empty,
while Edit still loaded its saved image. Interactive browser save-to-Add flow
remains **Not verified** by these component tests.

## Product detail description and category label (2026-10-06)

- [ ] Open product details: the badge shows the assigned subcategory only, falls
  back to the parent category when missing, and hides when both are missing.
- [ ] The Description section appears before Variants. Empty/whitespace-only
  descriptions show "No description provided".
- [ ] Multiline and long descriptions wrap inside the modal; mobile scrolling
  keeps variant controls and footer actions reachable.
- [ ] HTML-like description content appears as plain text, never executable HTML.

Verification: 14 product detail rendering/action regressions passed, including
missing category relations, empty/long/multiline descriptions and HTML escaping.
Interactive desktop/mobile layout remains **Not verified** by rendering tests.

## Evidence-based price optimization trial (2026-10-06)

- [ ] Apply the additive pricing_evidence migration, generate Prisma and restart.
- [ ] Regenerate a product with complete recipes and costs. Names, categories,
  descriptions, 30-day sales and fresh remaining forecast dates inform Gemini.
- [ ] Check ingredient margin labels and explicit market unavailability. Only
  three distinct equivalent online-menu competitors can establish a median.
- [ ] Source records show menu link, item, portion, amount and collection date;
  collection date is not a verified publication date. No hardcoded averages.
- [ ] Missing recipe costs block generation; no-sales/missing forecasts are
  disclosed rather than treated as proof of high prices or stable demand.
- [ ] Recommendations outside ±10% or below ingredient costs are rejected. A
  cost floor above the allowed band requires manual pricing review.
- [ ] Old policy-1 suggestions are viewable/dismissible but cannot be applied;
  regenerate before using them. Failed generation preserves prior suggestions.
- [ ] Successful application requires admin confirmation. Changed price/cost,
  duplicate application or failed audit insertion cannot partially commit.
- [ ] Generate again within seven days: matching product/source context reuses
  the persistent cache; changed context or expiry triggers lazy refresh.

Verification: 926 automated tests passed, 122 skipped; seven isolated PostgreSQL
pricing checks passed (including migration and increased-cost rollback). Client
lint/build passed. Actual public retrieval exposed price text from Cafe 1740;
Prism/Cafe de Lipa did not expose usable prices. Three comparable competitors
are **Not verified**, so market context may remain unavailable. Live Gemini output,
semantic portion matching and interactive application remain **Not verified**.
No migration was applied to public business data; no paid search is enabled.

## AI-estimated pricing policy (2026-10-06; supersedes menu-collection trial)

- [ ] Apply retire_pricing_menu_cache, generate Prisma, restart the backend and
  regenerate suggestions. Policy-1/2 suggestions cannot be applied under policy 3.
- [ ] Each variant displays an AI-estimated Lipa SME range with an unverified label,
  or explicitly unavailable. No competitor average, source quotes or scraping UI.
- [ ] Greater than ten-percent increases/decreases are allowed with reasoning.
  Ingredient costs still enforce the price floor; missing costs are not zero.
- [ ] Confirm sizes/hot-iced preparation influence estimates. Unclear portions
  should have assumptions explained rather than being asserted as verified.
- [ ] Admin approval still checks stale prices, current recipe costs, duplicate
  resolution and atomic price/status/audit handling. Generation alone changes no price.
- [ ] Provider failures and malformed/reversed market ranges preserve prior rows.
  Estimates are not hard price ceilings, observed competitor quotes or net profit.

Verification: 916 regression tests passed, 123 skipped; eight disposable PostgreSQL
checks passed, including migration retirement and a cost-safe change exceeding
10%. Client lint/build passed. Collector/source files and collector-specific tests
were removed, with no active references left. Previous migrations and historical
suggestion context remain intact. No public migration or live Gemini call occurred.
Live estimates, local market accuracy and interactive UI remain **Not verified**.
# Forecasting accuracy corrections — October 6, 2026

Use a newly generated run after restarting the ML service, backend and client.
Existing runs retain their original numbers; no migration is required for this batch.

- [ ] Record the new run ID and the exact seven forecast dates. A run today starts today,
  using completed sales through yesterday in Asia/Manila.
- [ ] Open individual evaluation and confirm the training cutoff, product scores and
  allocated variant scores. Constant actuals show R² N/A; negative scores are preserved.
- [ ] The baseline comparison states matched product-week observations, including zero weeks.
- [ ] Expand product sizes. Historical mix is labelled estimated; unavailable variants have
  a warning and retain historical demand rather than silently erasing previous sales.
- [ ] Sum daily counts and variant counts to confirm they match the weekly product total.
  Sparse demand is rounded across the week rather than independently discarded each day.
- [ ] Check revenue equals forecasted variant units multiplied by their captured prices.
- [ ] Review the missing-recipe warning. Confirm legitimate resale items separately; missing
  recipes must not appear as complete ingredient calculations.
- [ ] Switch to the previous run. Its chart shows its original dates rather than claiming
  that an expired forecast is the next seven days. Current recipes and stock remain current.

The reported previous run (159 units, ₱23,205, pooled R² 71.8%, MAE 1.53,
RMSE 2.57, MSE 6.60) is a user-reported baseline, not independently verified accuracy.
Corrections change cutoff, eligibility, rounding and evaluation populations; do not
claim a model improvement solely from comparing those two headline scores.

Live seeded-data model accuracy, browser acceptance and direct variant Prophet
comparison remain Not verified until those checks are performed. For the separate
read-only experiment, use an activated Python environment at the repository root:
`python audit/compare_forecast_methods.py --product-id PRODUCT_UUID`.


## Order-details confirmation handoffs (October 6)

- [ ] Open an accepted order and click Start Preparing. Confirm that the confirmation stays visible and usable. Dismiss it: Order Details remains open and status stays accepted.
- [ ] Confirm Start Preparing. Verify a successful request closes Order Details and reopening shows preparing.
- [ ] On another accepted order, click Cancel Order, select a reason and confirm. Verify cancellation, refund and ingredient restoration using the existing cancellation business checks.
- [ ] Dismiss cancellation, or observe an API rejection: Order Details remains available and no success message appears for a failed action.
- [ ] From a pending order, Accept opens payment collection; from a preparing order, Cancel opens the detailed loss/refund dialog.

## Inventory datepicker inside dialogs (October 6)

- [ ] Open Restock Ingredient and its expiry calendar. Select a current-month date and confirm the field updates.
- [ ] Use both month arrows, Clear and Done. Calendar clicks must not close the restock dialog or submit its form.
- [ ] Scroll the modal with the calendar open, then close/reopen it and check placement and selected date.
- [ ] Repeat date selection in the batch-edit dialog and check keyboard focus stays inside the modal.

## Direct variant forecasting and recorded-sales coverage (October 6)

- [ ] Restart the ML service and client, then generate a new forecast. Older runs retain their original method and scores.
- [ ] Expand a multi-size product. Confirm new variant rows have their own predictions and no historical-percentage allocation label.
- [ ] Confirm a never-sold/new variant shows its skip reason; seven days means calendar history since its first sale, not seven distinct selling days.
- [ ] Check seven dates begin after the displayed training cutoff in Asia/Manila. Today's sales must not enter training.
- [ ] Sum variant quantities to the product/menu total; compare revenue with units × each captured price.
- [ ] Compare ingredient requirements against those same quantities and recipes. Missing recipe warnings must remain visible.
- [ ] Open evaluation: product and variant weekly R²/MAE/RMSE/MSE, matched baselines and individual daily errors are visible. Undefined R² stays N/A.
- [ ] Check the coverage notice for days with no recorded menu-wide sales. It must explain unknown closure/completeness, rather than claim missing receipts or zero demand.
- [ ] Switch to an older run: allocated forecasts remain labelled as legacy and old scores are not rewritten.
- [ ] Record local runtime. Production hosting capacity and future real-sales accuracy remain Not verified.

The fixed historical benchmark ends September 28, the existing synthetic-history
boundary. Normal forecasts use yesterday; no synthetic extension was inserted.
The dataset is predominantly simulated and cannot establish real-world accuracy.
