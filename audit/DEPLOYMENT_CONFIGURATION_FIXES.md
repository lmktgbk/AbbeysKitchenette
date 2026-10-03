# Deployment configuration and recovery runbook

Target: Vercel frontend, Railway or Render backend and ML service, Supabase PostgreSQL. Payments remain manual; there are no payment webhooks to provision.

## Implemented changes

- Production boot rejects incomplete HTTPS origins, unspecified proxy trust, local rate counters, example JWT secrets, PostgreSQL URLs without `sslmode=verify-full`, missing mail transport, invalid sender addresses and partially configured integrations. Optional integrations may remain disabled.
- Authentication and OTP cookies share configurable SameSite options for both creation and deletion. They are host-only, HttpOnly and Secure in production.
- Browser mutations require the exact configured frontend Origin and `X-SmartCafe-Request: 1` before body parsing or database access. The central Axios client supplies the marker; it is not a credential. CORS permits only that origin. Production command-line mutating clients must also supply both headers and valid authentication.
- WebSocket upgrades reject unexpected or missing production Origin before authentication lookup. The subsequent [WebSocket reliability batch](./WEBSOCKET_RELIABILITY_FIXES.md) implements connection/subscription and transport budgets; hosted/load acceptance remains outstanding.
- All HTTP rate limiters use shared atomic PostgreSQL counters in production. Keys contain SHA-256 hashes of limiter identity and client key, not raw IP addresses. Expired records are pruned in bounded batches. Counters add a database round trip per limiter; database failure rejects protected requests with a safe 503 rather than bypassing protection. Health endpoints remain outside the general limiter.
- Vercel's SPA rewrite supports refreshes and deep links. ML binds the platform PORT and exposes `/livez` for unauthenticated hosting probes. ML business routes and `/health` still require the service key.

No live deployment, public database migration, backup or restore was performed in this batch. Hosting forwarding behavior, third-party cookie acceptance, actual TLS connections, production performance and recovery remain **Not verified**.

## Domains and cookies

Prefer `https://app.your-domain.com` and `https://api.your-domain.com`, both HTTPS under the same parent domain, with `COOKIE_SAME_SITE=strict`. Configure DNS and certificates on the selected providers first. Set `CLIENT_URL` to the frontend origin, without paths, and `API_PUBLIC_URL` to the backend origin. These are examples, not provisioned domains.

For unrelated `*.vercel.app` and Railway/Render domains, use `COOKIE_SAME_SITE=none`. Secure is enabled automatically in production. Some browsers or privacy settings block third-party cookies even with these flags: hosted login, OTP, refresh, logout and WebSocket reconnection must be checked in the intended browsers. Custom domains under one parent domain avoid that cross-site dependency. Vercel preview URLs are not automatically trusted; use separate staging services and an explicit staging origin.

The frontend's build-time `VITE_API_URL` must be `https://api.your-domain.com/api`. It contains no secret. Changing it requires a frontend rebuild. Only public configuration belongs in VITE variables; never put database, JWT, ML, mail or Sheets credentials there.

## Backend setup

Use a maintained Node 22 release at least 22.18, or a compatible newer LTS. The generated Prisma client contains TypeScript and the runtime depends on Node's type stripping support. Service root directory: `server`.

1. Install: `npm ci --include=dev`. Prisma CLI is needed for generation and release migrations.
2. Build: `npm run db:generate`.
3. Validate production variables: `npm run check:deploy`.
4. Release/pre-deploy: `npm run db:migrate:deploy` against the selected environment.
5. Start: `npm start`. The provider supplies PORT.
6. Hosting health path: `/api/ready`; process liveness: `/api/health`.

Railway pre-deploy commands run in a separate container; generation belongs in the build stage so its files exist in the runtime image. On Render, verify the chosen plan supports pre-deploy commands. If it does not, apply reviewed migrations through one controlled release job before starting the new version. Never run `migrate dev`, `migrate reset`, `db push`, seed or cleanup commands against production.

The latest migration is now `20261003090000_storage_assets`. Earlier pending migrations, including `20261003070000_automation_runs` and `20261003080000_shared_rate_limits`, must also be applied by `migrate deploy`. Confirm status afterwards. The subsequent storage batch replayed all eleven migrations in an isolated schema, which does not verify the current production migration history. Follow [STORAGE_RECOVERY_FIXES.md](STORAGE_RECOVERY_FIXES.md) for coordinated worker rollout and cleanup recovery limits.

Production example values, to set in the provider secret/environment settings:

```dotenv
NODE_ENV=production
TZ=Asia/Manila
CLIENT_URL=https://app.your-domain.com
API_PUBLIC_URL=https://api.your-domain.com
COOKIE_SAME_SITE=strict
TRUST_PROXY_HOPS=1
RATE_LIMIT_STORE=postgres
GENERAL_RATE_LIMIT_MAX=500
DATABASE_POOL_SIZE=10
JWT_EXPIRES_IN=8h
EMAIL_FROM=verified-sender@your-domain.com
```

`TRUST_PROXY_HOPS=1` is an example, not proof of either provider's topology. Verify the actual forwarding path and that the ingress overwrites client-supplied forwarding headers. The configured hop count must match every accessible route. Spoof a leftmost X-Forwarded-For value in staging and confirm it does not change the client's effective IP or staff IP restriction. Do not set trust proxy to `true`. If ingress paths have different lengths, use a reviewed trusted-proxy address policy instead of guessing a count.

Generate a new cryptographically random JWT secret. Set real SMTP HOST/USER/PASS or Gmail USER/APP_PASS. Set full Cloudinary/Sheets credential groups if enabled. Google credentials need their existing private-key newline representation. Keep credentials in provider secrets, not in committed configuration.

Use the Supabase direct endpoint or session pooler (port 5432) as appropriate for provider connectivity. Production DATABASE_URL and DIRECT_URL must include `sslmode=verify-full`. Download the Supabase CA from project settings if required and make its path available to the database driver through `sslrootcert`; do not disable certificate validation to make connection errors disappear. Verify runtime and CLI connections separately. Budget pooled connections across all backend replicas, ML pools and migration jobs; a configured per-replica pool is not a project-wide limit.

Measure the general request budget under an actual cafe workflow. Several terminals may share an IP. Increasing GENERAL_RATE_LIMIT_MAX affects only the general limiter, not specific login/OTP budgets. Shared counters depend on Supabase availability and add latency; no production throughput or latency target has been verified here.

## ML service setup

Service root: `ml-service`. Use a compatible Python 3.12 environment and install `pip install -r requirements.lock`. Start `python main.py`; set `FORECAST_HOST=0.0.0.0`. The hosting PORT overrides FORECAST_PORT. Run one application process initially and measure memory/CPU during real model jobs before selecting capacity.

Set DATABASE_URL to the intended Supabase database, with verified TLS, and the same random 64-character hexadecimal ML_SERVICE_KEY in backend and ML secrets. Backend FORECAST_URL points to the ML origin. Prefer provider private networking when both services support it; if exposed publicly, use HTTPS. Never expose the service key to the frontend.

Hosting probe: `/livez` returns only `{ "status": "ok" }`. It indicates process liveness, not database health or completed forecasts. Backend's authenticated `/health` probe and forecast job status provide separate evidence. Test invalid and missing keys on business routes before deployment.

## Workers, sockets and rollout

Run the backend and ML service on plans that stay available while scheduled jobs are expected to execute. A suspended service cannot run a cron timer. Database leases and durable automation runs coordinate replicas; startup catch-up is bounded and cannot replace continuous availability.

Deploy one backend replica initially: the realtime event hub is process-local. Shared database leases and rate counters do not replicate event fanout. Do not scale API replicas until shared realtime event delivery is implemented and tested.

Verify WSS upgrades on `/ws`, credential cookies, heartbeat/reconnection and rejected attacker origins through the actual proxy. Keep the platform termination grace period longer than the backend's 20-second shutdown deadline. Test SIGTERM during an active request, Sheets delivery and ML job; inspect durable statuses after restart. Avoid overlapping an older worker version that lacks the current database lease rules with the new version during rollout.

Railway deployment health checks are deployment gates, not continuous monitoring. Configure independent uptime/error/latency alerts and readiness monitoring. No uptime monitor or alert service is provisioned by these code changes.

## Backup and restore procedure — Not verified

The actual Supabase plan, backup retention, PITR availability and restore permissions have not been inspected. Check these in the project's dashboard. Agree on measurable recovery point and recovery time targets, then rehearse them. PostgreSQL dump/restore tools were not found on this workstation's PATH during this batch.

1. Record database version, migration history, application commit, backup time and retention. Use the supported Supabase backup/export route or PostgreSQL tools against a direct/session connection. Treat dumps as sensitive: they contain customer/staff data, password hashes and session state. Encrypt backups, restrict access, retain a copy outside the project and never commit a dump.
2. Create a separate recovery project/database. Confirm its URL is different from production before importing. Follow Supabase's supported restore procedure for managed roles/extensions and database version; do not blindly restore ownership or platform schemas.
3. Restore and inspect migration status, constraints, indexes and RLS. Compare order/payment/refund/shift totals, stock balances and movement records, user/session data and job history against the backup manifest. Apply only reviewed missing migrations.
4. Start a recovery instance with external delivery and scheduled automation disabled. Keep Sheets, mail and Gemini credentials unset until reconciliation is complete. Authenticate test users only in recovery. Do not replay real notifications or orders as a restore test.
5. Reconcile outbox state against the actual Google Sheet before enabling delivery. A restored database may be older than the sheet; blindly reusing row reservations can collide with later records. Review blocked/unknown automation outcomes and external ML jobs before retrying. Cloudinary assets and Google Sheets require their own recovery strategy; a PostgreSQL backup does not restore those services or Supabase Storage file contents.
6. Rehearse business reads and isolated writes, measure downtime/data age, revoke sessions or rotate credentials where recovery requires it, and document the actual result. Remove only the confirmed disposable recovery environment afterwards.

Do not mark backup/recovery acceptance complete because a dump command succeeded. A successful, reconciled restore is the evidence. Do not use Prisma reset as a rollback strategy; review application/schema compatibility and prefer a tested forward fix when the older version cannot safely use the upgraded schema.

## Verification evidence

- 33 focused JavaScript checks: production validation, real HTTP CORS/CSRF boundaries, forwarded client IP selection, session/OTP/logout cookie headers and cleanup failure handling. Four additional real WebSocket upgrade checks verify accepted and rejected origins before session lookup.
- Five opt-in PostgreSQL checks: concurrent shared counters, expiry/reset/decrement, overflow protection, pruning/RLS and one budget across two real HTTP servers. All ten migrations replayed into a generated schema; schema removed afterwards.
- Eight isolated ML checks include public liveness and private business/health authentication.
- The full backend suite passed 668 tests before the final two malformed-URL cases and four socket cases were added; those additions passed focused checks. Frontend production build and changed-file lint passed; the existing large-bundle warning remains open. Prisma schema validation and client generation passed. ML hosting PORT precedence was verified without external calls.
- Live browser/hosting, SMTP delivery, provider certificate configuration, load limits and backup restoration: **Not verified**. Acceptance cases are in FINAL_TESTING_CHECKLIST.md.

## Provider references

- [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/)
- [Browser cookie rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [Vercel Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite)
- [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command) and [health checks](https://docs.railway.com/deployments/healthchecks)
- [Render deployment lifecycle](https://render.com/docs/deploys)
- [Supabase connection/TLS modes](https://supabase.com/docs/guides/database/connecting-to-postgres) and [backup limitations](https://supabase.com/docs/guides/platform/backups)
