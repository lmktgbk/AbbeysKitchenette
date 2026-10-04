# Final implementation batch — 2026-10-04

## Changes

- M16: Shift KPIs use one statement with separate sales/refund aggregates and one consistent cutoff/snapshot. The old path used 2 + 2N statements for N sessions. Cash tender, paid cancellations, manual e-wallet legs, refund timing and stored closed-shift variance retain their semantics. Add an opening-date index.
- M14: Audit delivery admits internal anomaly runs in the same transaction as its completion marker. Primary mutations already commit their audit intents transactionally. Anomaly workers use leases, bounded retries and fenced atomic publication/completion. Failed publication retries without replaying the primary business mutation. Rule objects are scoped per evaluation; publication rechecks dedup under a transaction advisory lock.
- M23: Add redacted JSON HTTP logs/request correlation and an admin-only operations endpoint for process/request/backlog metrics. Production unexpected-error logging excludes raw provider/database messages. Hosting collection, alerts and distributed traces remain unverified.
- L01: Remove unused declarations and post-render draft/page resets, use subscribed form fields, release image preview allocations and ignore stale loss-modal responses. Full frontend lint has zero errors/warnings; broad architectural rewrites are not part of this cleanup.
- M24/H15: Add a GitHub regression workflow with disposable PostgreSQL, Python checks, frontend build/lint and an explicit dependency gate. It does not deploy or carry production credentials. The residual Prisma advisory means its security gate currently fails; no clean security status is claimed.
- L02: Consolidate setup, deployment and incident/recovery instructions in README.md and OPERATIONS_RUNBOOK.md.

## Deployment requirement

Apply 20261004010000_anomaly_trigger_kind before starting the new backend. It extends the run-kind constraint and adds shifts_opened_at_idx. No main-database migration has been applied by this batch. Read-only migration status confirms this one migration is pending; Prisma validation and generation pass.

Manual testing can begin after migration and service restart in a test environment. Production approval still needs manual acceptance, provider/hosting/load evidence, operational alerts, backup/restore rehearsal and resolution/review of the residual dependency advisory. Test outcomes are recorded in CURRENT_STATUS.md and FINAL_TESTING_CHECKLIST.md.

## Final verification

- Combined backend run: 940 tests passed in 58 files with all 13 opt-in database suites enabled, including 117 disposable-schema PostgreSQL cases. No application/public business rows were seeded or changed.
- Three additional real React server-rendered draft/page reset checks passed separately after that run started: 943 distinct regression cases verified in total.
- Frontend production build and full lint with max-warnings=0 passed. Focused changed-backend lint and whitespace checks passed.
- Python security and worker suites: 19 tests passed, including synthetic Prophet/MBA computation. Six additional Python/PostgreSQL scenario groups passed, including twenty competing admissions across two pools, expiry, rollback and fenced publication.
- Python pip check passed; OSV checked 71 installed packages, no affected packages, pagination complete. Client npm audit reports zero; server reports three high package entries for the same documented Prisma/deepmerge advisory.
- Prisma validation/generation passed. Read-only main migration status: 12 prior migrations applied, new migration pending. GitHub/Linux clean-install execution is **Not verified** and the dependency gate is intentionally not bypassed.

The first combined run had one email-verification contention failure: four rather than five committed failed guesses. The original assertion accepted any rejected promise. Verification now obtains session fields in the account-lock query, eliminating one round trip while keeping the pending-request read after acquiring the lock. The test requires eight INVALID_EMAIL_CODE outcomes and exactly five committed guesses; focused and repeated combined runs passed. Storage transaction timeouts return a fail-closed 503 rather than a successful verification.

The pg concurrent-query deprecation still appears in the broad suite. pg 9 compatibility is not established. Browser visuals, live SMTP/Cloudinary/Sheets, hosting, alert delivery, backup/restore and representative load remain **Not verified**; use the consolidated manual checklist before deployment approval.
