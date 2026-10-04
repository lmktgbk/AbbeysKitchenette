# Current remediation status — 2026-10-04

This is the current implementation ledger. REPORT.md and findings.json preserve the original audit evidence; their historical unresolved labels are not the current count. **Implemented** means the identified code behavior was changed and selected regression checks passed, not that deployment or every live acceptance case is verified.

The original audit contains **42 findings: 33 implemented, three open, six partially addressed**. Therefore **9 original findings remain outstanding** after the administrative mutation recovery batch. Additional rollout constraints and final acceptance are listed separately rather than counted as new original findings.

## Implemented — 33

| Findings | Remediation evidence |
| --- | --- |
| C01, H01, H02, M01, M11 | [Authentication/session fixes](AUTHENTICATION_FIXES.md) |
| H03, H04, H05 | [Order authorization and state guards](ORDER_STATE_FIXES.md) |
| H06, H07, H08 | [Financial transactions and idempotency](FINANCIAL_TRANSACTION_FIXES.md) |
| H09 | [Transactional price approval](PRICE_APPROVAL_FIXES.md) |
| M13 | [AI pricing schema, ownership and atomic publication](AI_PRICING_FIXES.md) |
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

## Open — three

| ID | Remaining implementation | Next verification |
| --- | --- | --- |
| M16 | shift.repository.js getStats reads historical sessions and performs per-session sales/refund work. Replace with set-based aggregation while preserving existing cash/payment/variance semantics. | Compare results on isolated mixed history; measure query count and realistic dataset latency. |
| M23 | Production log collection, metrics, tracing, alerts and their delivery are not established by current fixed console warnings. Include blocked automation/upload outcomes and retry backlogs. | Trigger isolated failures and verify collected redacted signals and alert delivery. |
| L01 | Remaining lint and large domain-module maintenance debt. Current full frontend lint: 35 errors, 12 warnings; changed frontend files in this batch pass. | Resolve actionable failures in focused batches; preserve business regressions. |

## Partially addressed — six

| ID | Completed | Remaining |
| --- | --- | --- |
| M14 | [Order/inventory durable intents, exact-once database delivery and revisioned availability repair](DOMAIN_EFFECT_RECOVERY_FIXES.md); 17 distinct isolated PostgreSQL scenarios verified. | Pricing generation/apply/dismiss and shift open/close now capture audit work transactionally; see [pricing/shift recovery](PRICING_SHIFT_RECOVERY_FIXES.md). [Product/category/staff/settings mutation recovery](ADMIN_MUTATION_RECOVERY_FIXES.md) is also implemented. Roll out capture to remaining auth/report/ML producers, including staff invitation delivery outcomes; anomaly hooks and live process-kill/hosting/load acceptance remain. |
| H14 | Dependency upgrades, compatible integration checks and Python lock documented. | Residual Prisma CLI/deepmerge advisory review and clean deployment/install security checks; see DEPENDENCY_SECURITY_FIXES.md. |
| H15 | Provider configuration, migration commands, health/shutdown and backup/restore runbook. | Actual Vercel/backend/ML deployment, release automation/rollback rehearsal, backups and reconciled restore. |
| M15 | Ordered migration history and isolated PostgreSQL rehearsals, including all 12 migrations in the effects checks. | Confirm deployed constraints/history and realistic existing-data upgrade/compatibility/recovery; an isolated replay does not establish the main database state. |
| M24 | Substantial deterministic backend/client/worker and optional isolated PostgreSQL regressions. | Comprehensive browser E2E, live sandbox integrations, representative load and CI release gates. |
| L02 | Essential audit/remediation/deployment runbooks are versioned under audit. | Consolidated onboarding/incident documentation and clean-environment provisioning exercise; historical docs/ remains ignored. |

## Deployment and acceptance still pending

- Use one backend replica until shared socket event fanout is implemented and verified. Shared HTTP rate limits and database job leases do not share realtime events.
- Apply reviewed migrations through deploy; never infer main-database migration state from disposable-schema tests. User reports 20261004000000_domain_effects migration and client generation completed. This pricing/shift batch adds no migration; main-database constraints were not independently inspected.
- Live Cloudinary, hosted cookie/proxy/WSS behavior, external delivery, backups/restoration and load capacity remain **Not verified** unless separate acceptance evidence is recorded.
- Track the pg transaction-query deprecation as a compatibility follow-up before a pg 9 upgrade. It is not proof of an observed data corruption event.
- Unknown provider upload/job outcomes intentionally require restricted operator review. Do not blindly replay or delete them.
- Route splitting removes the large eager application chunk, but the large favicon/fonts, total page weight and Web Vitals still deserve measured optimization. Chunk size alone is not a latency benchmark.

All final user acceptance stays in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md). Recommended implementation order: M14, M16, M23, then focused L01 work and the release/recovery/testing gates. This order prioritizes correctness before further performance tuning.
