# Current remediation status — 2026-10-04

This is the current implementation ledger. REPORT.md and findings.json preserve the original audit evidence; their historical unresolved labels are not the current count. **Implemented** means the identified code behavior was changed and selected regression checks passed, not that deployment or every live acceptance case is verified.

The original audit contains **42 findings: 32 implemented, five open, five partially addressed**. Therefore **10 original findings remain outstanding** after the frontend batch. Additional rollout constraints and final acceptance are listed separately rather than counted as new original findings.

## Implemented — 32

| Findings | Remediation evidence |
| --- | --- |
| C01, H01, H02, M01, M11 | [Authentication/session fixes](AUTHENTICATION_FIXES.md) |
| H03, H04, H05 | [Order authorization and state guards](ORDER_STATE_FIXES.md) |
| H06, H07, H08 | [Financial transactions and idempotency](FINANCIAL_TRANSACTION_FIXES.md) |
| H09 | [Transactional price approval](PRICE_APPROVAL_FIXES.md) |
| H10 | [Immutable inventory settlement](INVENTORY_TRANSACTION_FIXES.md) |
| H11 | [Private ML service](ML_SERVICE_SECURITY_FIXES.md) |
| H12, H13 | [ML job ownership and compute isolation](ML_RELIABILITY_FIXES.md) |
| M02 | [Recovery-email verification](RECOVERY_EMAIL_FIXES.md) |
| M03, M04 | [Request parsing and input bounds](REQUEST_VALIDATION_FIXES.md) |
| M05 | [Upload validation](UPLOAD_SECURITY_FIXES.md) and [durable cleanup](STORAGE_RECOVERY_FIXES.md) |
| M06, M07 | [Sheets outbox and delivery](SHEETS_SYNC_FIXES.md) |
| M08 | [Durable scheduled runs](AUTOMATION_RELIABILITY_FIXES.md) |
| M09 | [Readiness and shutdown](DEPLOYMENT_LIFECYCLE_FIXES.md) |
| M10 | [Hosted configuration and shared HTTP limits](DEPLOYMENT_CONFIGURATION_FIXES.md) |
| M12, M19 | [Socket budgets and reconnect reconciliation](WEBSOCKET_RELIABILITY_FIXES.md) |
| M17, M18, M20, M21, M22 | [Frontend loading, menu, dialogs and cart](FRONTEND_RELIABILITY_FIXES.md) |

## Open — five

| ID | Remaining implementation | Next verification |
| --- | --- | --- |
| M13 | Gemini pricing output still maps model-supplied identity/prices directly into recommendation rows in priceOptimization.service.js. Validate schema, requested-product ownership, duplicates, finite bounds and authoritative current prices before persistence. | Mock malicious/invalid/foreign-product recommendations; reject before writes. No paid AI calls required. |
| M14 | General post-commit audit/notification/availability effects lack complete durable event delivery and repair. The Sheets/storage fixes cover their own domains only. | Fail effects and terminate after primary commit; recover without repeating money/stock writes. |
| M16 | shift.repository.js getStats reads historical sessions and performs per-session sales/refund work. Replace with set-based aggregation while preserving existing cash/payment/variance semantics. | Compare results on isolated mixed history; measure query count and realistic dataset latency. |
| M23 | Production log collection, metrics, tracing, alerts and their delivery are not established by current fixed console warnings. Include blocked automation/upload outcomes and retry backlogs. | Trigger isolated failures and verify collected redacted signals and alert delivery. |
| L01 | Remaining lint and large domain-module maintenance debt. Current full frontend lint: 35 errors, 12 warnings; changed frontend files in this batch pass. | Resolve actionable failures in focused batches; preserve business regressions. |

## Partially addressed — five

| ID | Completed | Remaining |
| --- | --- | --- |
| H14 | Dependency upgrades, compatible integration checks and Python lock documented. | Residual Prisma CLI/deepmerge advisory review and clean deployment/install security checks; see DEPENDENCY_SECURITY_FIXES.md. |
| H15 | Provider configuration, migration commands, health/shutdown and backup/restore runbook. | Actual Vercel/backend/ML deployment, release automation/rollback rehearsal, backups and reconciled restore. |
| M15 | Ordered migration history and isolated PostgreSQL rehearsals, including all 11 migrations in the storage checks. | Confirm deployed constraints/history and realistic existing-data upgrade/compatibility/recovery; an isolated replay does not establish the main database state. |
| M24 | Substantial deterministic backend/client/worker and optional isolated PostgreSQL regressions. | Comprehensive browser E2E, live sandbox integrations, representative load and CI release gates. |
| L02 | Essential audit/remediation/deployment runbooks are versioned under audit. | Consolidated onboarding/incident documentation and clean-environment provisioning exercise; historical docs/ remains ignored. |

## Deployment and acceptance still pending

- Use one backend replica until shared socket event fanout is implemented and verified. Shared HTTP rate limits and database job leases do not share realtime events.
- Apply reviewed migrations through deploy; never infer main-database migration state from disposable-schema tests. This frontend batch adds no migration.
- Live Cloudinary, hosted cookie/proxy/WSS behavior, external delivery, backups/restoration and load capacity remain **Not verified** unless separate acceptance evidence is recorded.
- Track the pg transaction-query deprecation as a compatibility follow-up before a pg 9 upgrade. It is not proof of an observed data corruption event.
- Unknown provider upload/job outcomes intentionally require restricted operator review. Do not blindly replay or delete them.
- Route splitting removes the large eager application chunk, but the large favicon/fonts, total page weight and Web Vitals still deserve measured optimization. Chunk size alone is not a latency benchmark.

All final user acceptance stays in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md). Recommended implementation order: M13, M14, M16, M23, then focused L01 work and the release/recovery/testing gates. This order prioritizes correctness before further performance tuning.
