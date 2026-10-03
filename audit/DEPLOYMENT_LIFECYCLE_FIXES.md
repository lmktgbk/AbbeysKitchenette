# Readiness and shutdown fixes

Core readiness now requires PostgreSQL, while ML health is reported as optional degradation. Liveness remains a process check. Health routes precede the general request limiter and return no-store responses. Probes run concurrently with a three-second response deadline, five-second cache, and shared outstanding operations to prevent probe storms.

Runtime Prisma and the read-only SELECT 1 probe share a PostgreSQL pool. Connection acquisition and probe queries have 2.5-second limits; the probe response deadline covers their combined duration. DATABASE_POOL_SIZE defaults to 10 (allowed 1–50). Size all replica pools against the Supabase connection budget. The client query deadline is not a general database statement timeout.

SIGTERM and SIGINT mark readiness unavailable, reject new business requests, stop Sheets and cron admission, and wait for admitted HTTP requests and scheduled jobs before disconnecting Prisma. A twenty-second hard deadline terminates lingering connections and exits unsuccessfully. Deployment termination grace must exceed twenty seconds. Forced termination can interrupt work; durable Sheets leases recover after expiry, but general scheduled job deduplication remains M08 and is not implemented here.

Verification: 620 backend tests passed; 13 optional database cases skipped in the ordinary run. Seven Sheets PostgreSQL cases were separately run successfully in a disposable schema. Frontend production build passed with the existing large-bundle warning. Lifecycle tests exercise real HTTP health routes, failed/stalled dependencies, singleflight/cache behavior, shutdown admission, draining and deadline handling. Actual hosting signals, reverse proxy behavior, deployed Supabase probe latency, live Google delivery, and full browser regression: **Not verified**.

## Deployment

1. Stop the previous backend and Sheets sender before applying the new Sheets migration. Do not run old and new senders together.
2. From server, run npm.cmd run db:migrate:deploy and npm.cmd run db:generate. These commands were not run against public application tables during this batch.
3. Restart the backend. Test the cases in FINAL_TESTING_CHECKLIST.md, especially M06–M09. Keep the general cron scheduler on one replica until M08 is addressed.
4. Configure hosting traffic checks against /api/ready and process checks against /api/health. Verify ML downtime leaves core readiness at 200 and database failure returns 503 within the probe deadline.

The new Sheets migration is forward-only for this rollout; downgrade compatibility has not been verified. Existing unsynchronized legacy entries require manual reconciliation rather than reconstruction from mutable order data. Consult SHEETS_SYNC_FIXES.md before enabling the sender.
