# SmartCafe ? consolidated final testing checklist

Use this single file for the final regression pass after the remaining audit fixes
are implemented. It covers all 42 original audit findings, critical workflows,
concurrency, failures and deployment checks. Keep adding new cases to this file
as later implementation decisions change behavior.

**This is a manual acceptance checklist, not a script that runs every test.**
Some cases require developer assistance, a concurrency harness or staging failure
injection. A browser-only pass does not verify database locking or recovery.
Automated tests should still run after each code batch; the comprehensive manual
pass can wait until the remediation work is complete.

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

Current reference, not a final PASS: the recovery-email batch has 491 automated tests
passing, including 23 recovery-email security/rollback cases. Six additional isolated PostgreSQL tests pass; they are opt-in and skipped in the ordinary suite. The frontend
build passed with an existing large-bundle warning. Submission code and POS pages
passed lint; the guest page retains its baseline four errors and one warning.
The additive submission-ledger migration is applied; schema diff and read-only
backend/public-role access checks passed. Real PostgreSQL contention and complete
browser workflows remain **Not verified**. Full frontend lint/dependency findings remain
open. The user reported basic login, OTP, logout and password reset working;
that report does not replace the security/concurrency cases below.

The item-consumption migration is also applied, and all four migrations are current
with an empty Prisma schema diff. Actual PostgreSQL constraint, settlement SQL,
stock-version and rollback checks passed using disposable fixtures that were rolled
back. Both updated loss/reconciliation dialogs pass lint. This does not replace
multi-connection transaction tests or a complete browser acceptance pass.

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

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Upload spoofed MIME, double-extension, corrupt and oversized images to an isolated storage account. Try excessive dimensions, abort mid-upload and inject a database failure after upload. Check storage for abandoned assets.

**Acceptance criteria:** In an isolated storage account, test spoofed MIME, double extensions, corrupt images, huge dimensions, aborted uploads, oversize bodies and DB failure after upload. Verify rejection and cleanup.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M06 ? Repeated Sheets adjustment events conflict with uniqueness

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Make two separate adjustments to the same paid order. Inspect persisted sync events and the test spreadsheet. Retry each event and verify that both distinct adjustments remain represented exactly once.

**Acceptance criteria:** Perform two item adjustments to one paid order. Require two distinct persisted events and two correctly correlated external rows, with safe replay.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M07 ? Sheets sender can block forever and duplicate external rows

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** With a stub Sheets transport, simulate hangs, repeated 401/429/500, successful append followed by DB failure, and worker restart. Observe bounded attempts, persisted status and duplicate prevention.

**Acceptance criteria:** Stub never-resolving responses, persistent 401/429/500, append-success/DB-failure and process termination. Require bounded completion, eventual delivery and one row per event.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M08 ? Cron and asynchronous tasks assume a single long-lived process

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

**Steps:** Run two staging replicas across a cron boundary. Kill the job owner and restart it. Inspect scheduled-run uniqueness, leases/recovery and eventual terminal status.

**Acceptance criteria:** Run two replicas, kill a worker mid-job and restart across a schedule boundary. Require one scheduled run, recoverable ownership and accurate terminal job state.

**Result:** NOT RUN

**Evidence / defect / retest:** ___

### M09 ? Optional ML availability gates core API readiness

**Priority:** Medium

**Implementation:** Open at checklist creation; final acceptance NOT RUN

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
