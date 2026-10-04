# Current remediation status — 2026-10-04

This is the current implementation ledger. REPORT.md and findings.json preserve the original audit evidence; their historical unresolved labels are not the current count. **Implemented** means the identified code behavior was changed and selected regression checks passed, not that deployment or every live acceptance case is verified.

The original audit contains **42 findings: 35 implemented, zero open, seven partially addressed**. Therefore **7 original findings remain outstanding** as verification, operations or dependency gates after the final implementation batch. Additional rollout constraints and final acceptance are listed separately rather than counted as new original findings.

## Implemented — 35

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
| M16, L01 | [Set-based shift KPIs and frontend cleanup](FINAL_IMPLEMENTATION_BATCH.md) |

## Open implementation findings — zero

M16 shift aggregation and L01 actionable frontend lint cleanup are implemented; see [final implementation evidence](FINAL_IMPLEMENTATION_BATCH.md). This does not claim that all possible technical debt or performance scenarios are eliminated.

## Partially addressed — seven

| ID | Completed | Remaining |
| --- | --- | --- |
| M23 | Redacted production HTTP correlation, admin-only process/request/backlog metrics and regression checks; see [operations runbook](OPERATIONS_RUNBOOK.md). | Hosted log collection, distributed traces, alert delivery, platform resource budgets and operational failure acceptance remain **Not verified**. |
| M14 | [Order/inventory durable intents, exact-once database delivery and revisioned availability repair](DOMAIN_EFFECT_RECOVERY_FIXES.md); 17 distinct isolated PostgreSQL scenarios verified. | Pricing generation/apply/dismiss and shift open/close now capture audit work transactionally; see [pricing/shift recovery](PRICING_SHIFT_RECOVERY_FIXES.md). [Product/category/staff/settings mutation recovery](ADMIN_MUTATION_RECOVERY_FIXES.md) is also implemented. [Authentication and invitation audit capture](AUTH_EFFECT_RECOVERY_FIXES.md) is implemented with explicit uncertain-email outcome handling. [Report/ML producer capture](REPORT_ML_RECOVERY_FIXES.md) is implemented; seven isolated PostgreSQL checks passed. [Durable anomaly admission and fenced/deduplicated publication](FINAL_IMPLEMENTATION_BATCH.md) are now implemented and four isolated PostgreSQL cases pass. Live process-kill/hosting/load acceptance remains. |
| H14 | Dependency upgrades, compatible integration checks and Python lock documented. | Current recheck: client zero advisories, Python zero affected packages among 71, server three high package entries for one residual advisory. Prisma CLI/deepmerge review and clean deployment/install security gates remain; see DEPENDENCY_SECURITY_FIXES.md. |
| H15 | Provider configuration, migration commands, health/shutdown and backup/restore runbook. | A GitHub regression workflow is added with a disposable database and strict dependency gate. Actual CI execution on Linux, Vercel/backend/ML deployment, release/rollback rehearsal, backups and reconciled restore remain unverified; the residual advisory currently blocks its security gate. |
| M15 | Ordered migration history and isolated PostgreSQL rehearsals, including all 12 migrations in the effects checks. | Read-only main database status confirms 12 prior migrations applied and 20261004010000_anomaly_trigger_kind pending. Deploy that reviewed migration and confirm constraints/history and realistic existing-data upgrade/compatibility/recovery; an isolated replay does not establish the main database state. |
| M24 | 943 distinct backend/client regressions verified (940 combined plus three draft-state checks), including all 117 opt-in PostgreSQL cases; 19 Python tests and six Python/database scenario groups pass. | Comprehensive browser E2E, live sandbox integrations, representative load and CI release gates. |
| L02 | Essential audit/remediation/deployment runbooks are versioned under audit. | [README](../README.md) and [operations/incident runbook](OPERATIONS_RUNBOOK.md) are consolidated. Clean-environment provisioning and recovery exercise remains unverified; historical docs/ remains ignored. |

## Deployment and acceptance still pending

- Use one backend replica until shared socket event fanout is implemented and verified. Shared HTTP rate limits and database job leases do not share realtime events.
- Apply reviewed migrations through deploy; never infer main-database migration state from disposable-schema tests. User reports 20261004000000_domain_effects migration and client generation completed. This final batch adds 20261004010000_anomaly_trigger_kind and a shift-date index; it remains pending on the main database. Apply it before restarting the new backend.
- Live Cloudinary, hosted cookie/proxy/WSS behavior, external delivery, backups/restoration and load capacity remain **Not verified** unless separate acceptance evidence is recorded.
- Track the pg transaction-query deprecation as a compatibility follow-up before a pg 9 upgrade. It is not proof of an observed data corruption event.
- Unknown provider upload/job outcomes intentionally require restricted operator review. Do not blindly replay or delete them.
- Route splitting removes the large eager application chunk, but the large favicon/fonts, total page weight and Web Vitals still deserve measured optimization. Chunk size alone is not a latency benchmark.

All final user acceptance stays in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md). The next phase is manual acceptance and staging release/recovery testing. No clean production approval is issued while the seven partial findings remain.
