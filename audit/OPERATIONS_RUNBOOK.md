# SmartCafe operations and release runbook

## Service map

Browser → Vercel React frontend → Express API and /ws → Supabase PostgreSQL.
The backend calls private Python ML using ML_SERVICE_KEY, SMTP, Cloudinary, Gemini and Google Sheets. Python persists ML jobs/results and audit intents into the same database. Backend workers deliver durable audits/notifications, repair availability, reconcile storage/Sheets, execute schedules and process anomaly triggers.

Manual GCash/Maya entries are recordkeeping; operator reconciliation remains required. No payment-provider integration is expected.

## Release sequence

1. Record the application commit, current migration status, backup timestamp and recovery owner. Rehearse the release on staging first.
2. Confirm the backup can be restored into a separate database. A backup dashboard entry alone does not verify restore or application consistency.
3. Stop admissions and drain the single backend and ML worker during this migration rollout. Old backends do not understand internal anomaly runs; avoid mixing old/new schedulers during the transition.
4. From server run `npm ci`, `npm run db:migrate:deploy` and `npm run db:generate`. This batch adds 20261004010000_anomaly_trigger_kind: allow internal anomaly jobs and index shift opening dates. It does not delete business rows. The index takes a table lock during creation; rehearse duration before a busy production release.
5. Deploy backend/ML from the same reviewed commit, restart both, then deploy the rebuilt frontend. Railway/Render backend source root must include both `server/` and `shared/`; run build/start commands inside server as described in [shared-source deployment](SHARED_SOURCE_DEPLOYMENT.md); ML root is ml-service, install requirements.lock, start is `python main.py`. Set FORECAST_HOST=0.0.0.0; hosting PORT is respected. Vercel root is client with outside-root source inclusion enabled, `npm run build` and dist output.
6. Verify /api/health, /api/ready and ML /livez. Private ML /health also needs the service credential. Check browser login, WSS, role boundaries and one isolated POS workflow.
7. Record metrics/log collection and delivery tests before opening normal admissions. Retain the prior application artifact and migration/backup evidence.

Use HTTPS frontend/API origins, verified proxy hop count, production cookie/TLS settings, shared rate limits and bounded database pools from the existing deployment configuration guide. An ML outage may degrade readiness without blocking POS; a database outage must fail readiness.

## Signals and access

Production HTTP completion events are JSON stdout containing request ID, route template, status and duration. X-Request-ID joins an API error reference to its completion event. Request bodies, cookies, authorization headers, raw URLs and query strings are excluded. Unexpected production errors omit database/provider message and stack values; existing component warnings still require review before exporting logs to third parties.

GET /api/operations/metrics requires an active admin session. It reports process uptime/memory, cumulative CPU, bounded per-route counts/errors/auth failures/mean/max duration and durable backlog counts/oldest timestamps. Queue probes coalesce, cache successful results for ten seconds and use a 2.5-second client timeout. Metrics are process-local and reset at restart; durable queue counts are database-backed. Never place an admin token in an uptime monitor URL or public dashboard.

Collect stdout and platform CPU/memory/disk metrics in the selected host. Set retention/access controls. Configure alerts for readiness failures, sustained 5xx/latency above the agreed budget, pool exhaustion, memory pressure, blocked work and growing oldest backlog age. CPU values from this endpoint are cumulative microseconds; compute deltas over time or use the host's CPU percentage. No alert channel has been connected or notified by this batch.

Before sign-off, deliberately trigger a staging failure and confirm its request ID is searchable, the alert reaches the designated operator, and secrets do not appear. Local instrumentation is not evidence of production alert delivery. Tracing across provider and Python calls remains a follow-up.

## Incident handling

- Database outage: suspend admissions, inspect readiness and pool/platform metrics, restore connectivity and let leased workers recover. Do not reset tables or replay business requests without their idempotency policy.
- Blocked effects/anomaly jobs: inspect safe state/error identifiers and matching audit intent. Diagnose the cause before an operator-approved retry in staging; do not manually mark work delivered without its records.
- Uncertain SMTP, upload, Sheets or external job outcome: reconcile the provider and local ledger before retrying. Unknown outcome is not proof of failure; blind replay can duplicate delivery or delete an attached image.
- Slow shift statistics: confirm the shift opening-date index and orders shift index are present, inspect an execution plan on staging and compare financial totals. Do not invent a latency guarantee from query count alone.
- Credential compromise: rotate the affected secret through the hosting secret manager, revoke sessions where relevant, restart affected processes and retain redacted incident evidence.

## Recovery rehearsal

Restore a backup into a new isolated database, deploy the matching application/migration version and compare order/payment/refund/stock/shift totals and constraints. Restore external storage separately; database backups do not necessarily contain provider images. Review restored outboxes and schedules before starting workers so historical mail or provider effects are not blindly replayed. Agree and measure recovery point/time objectives.

Do not roll back the anomaly-kind constraint while anomaly rows remain. A rollback to the old backend requires stopping new workers and reviewing pending internal runs; prefer a compatible forward fix. A destructive database restore requires an explicit operational decision and reconciliation of transactions since the backup.

Actual provider deployment, alerts, backup restoration, rollback and recovery timing: **Not verified**.
