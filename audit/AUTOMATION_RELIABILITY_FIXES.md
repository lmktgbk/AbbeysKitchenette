# Durable scheduled runs (M08)

The former process-local cron scheduler could repeat work across replicas and forgot ownership after restart. It now polls durable schedules every fifteen seconds and admits a unique run for each job and Manila business date. Settings and occurrence time are read from PostgreSQL; schedule changes cannot create another same-day run. Only the most recent occurrence within twenty-four hours is caught up. Older missed dates require operator review rather than a startup flood.

## Ownership and commits

The automation_runs table stores the scheduled instant, status, attempts, owner, lease, retry time, fixed error code and external job ID. It has a due-work index and RLS without public policies. A shared background_leases row permits one scheduled worker across replicas. Claim and renewal use database time and short transactions; external calls never run inside those transactions. A five-minute lease renews every thirty seconds. Each attempt has a four-minute deadline. Shutdown aborts admission and outbound work; stale ownership cannot acknowledge a run or commit advisory publication.

Reorder and waste results replace their pending suggestions and mark the run successful in the same five-second transaction. Failure rolls back both changes. Those two advisory jobs retry up to three attempts, with one- then two-minute delays. An expired advisory owner can be replaced. The replacement can repeat an AI request and incur usage, but the stale owner cannot publish a second result.

Email and ML submission are not transactionally coupled to their external providers. A failure or expired owner is marked blocked with EXTERNAL_OUTCOME_UNKNOWN, not automatically repeated. This trades automatic recovery for avoiding duplicate messages or submissions. It is not an exactly-once delivery guarantee. Partial scheduled email delivery is surfaced for review, and ownership is checked before each recipient. SMTP and Gmail shortcut transports both have bounded connection, greeting and socket waits.

Acknowledged ML submissions retain their returned job ID as submitted. PostgreSQL worker state is reconciled into succeeded or blocked when the ML job completes or fails. Admission acknowledgement is not reported as completed analysis. Manual generation routes retain their existing behavior; this ledger governs scheduled runs.

Disabling a schedule blocks its queued work. Claim also rechecks the current stored enabled setting. An admitted operation may already have begun when its schedule is changed. Re-enabling does not automatically replay a blocked same-day run. Saved terminal history is retained.

## Upgrade and operations

Stop every previous backend scheduler before deploying this version. Apply 20261003070000_automation_runs with db:migrate:deploy, generate Prisma Client, then restart. This migration has not been applied to public application tables during this batch. Old and new schedulers must not run together.

Existing cron history cannot establish which already-due jobs ran. The migration records enabled occurrences in the previous twenty-four hours as blocked/MIGRATION_HISTORY_UNKNOWN. This prevents blind replay on the first upgraded startup. It does not invent successful history. Review these entries against existing ML jobs, suggestions and sent mail; future business-date runs remain eligible. Fresh databases with no configured schedules get no baseline entries.

Inspect the ledger with this read-only query:

```sql
SELECT run_key, kind, scheduled_at, status, attempts, last_error, result, updated_at
FROM automation_runs
ORDER BY scheduled_at DESC
LIMIT 50;
```

For blocked email, compare sent-mail/provider records and the report audit before considering another send; some recipients may already have received it. For an uncertain ML submission, inspect forecast_jobs or mba_jobs and attach/reconcile a confirmed result rather than blindly repeating admission. Do not reset owner, lease or status on an actively running record. No automatic operator retry UI is introduced in this batch. Backups, alerting and general post-commit audit delivery remain separate findings.

## Verification

637 ordinary backend tests pass; twenty-seven optional PostgreSQL cases are skipped in that run. Eleven automation PostgreSQL checks replay all nine migrations in a generated schema, verify upgrade baseline, unique admission, shared ownership, stale-owner rejection, retries, schedule disabling, transactional rollback with actual prior suggestion data, waste publication, ML status reconciliation and RLS, then remove the schema. No public business data, real email, paid AI calls or live ML jobs are used in these checks.

Unit/service regressions cover Manila day/weekly boundaries, bounded catch-up, same-day schedule edits, replica admission, restart, retry exhaustion, uncertain email, submission acknowledgement, stalled work, late commits, partial report delivery and shutdown.

Hosted multi-replica timing, process termination against a live provider, migration upgrade on public data and real scheduled report delivery: **Not verified**. Final acceptance cases are in FINAL_TESTING_CHECKLIST.md. The independent pg transaction-query deprecation remains a compatibility follow-up.
