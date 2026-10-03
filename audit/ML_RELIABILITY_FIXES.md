# ML concurrency and execution reliability

## Implemented behavior

Addresses H12/H13 with database-owned jobs and isolated computation:

- Admission serializes each job type in a short PostgreSQL transaction. Concurrent calls attach to the same running job across instances. A partial unique index also prevents two owned running rows per type. [PostgreSQL transaction advisory locks](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS) release with the transaction; no session lock is held while fitting models.
- Each job receives a UUID owner and a 120-second lease, renewed every 20 seconds. Every result/progress write locks the job row and checks its owner, running status and unexpired lease. An expired worker cannot publish results or revive a failed job.
- Startup and a 20-second recovery loop expire abandoned jobs and remove their partial result rows atomically. They preserve healthy work owned by another instance. Unowned legacy running jobs are treated as interrupted during rollout.
- Forecast and MBA pipelines run in spawned child processes, keeping native model work off the API event loop. Supervision stops failed, expired or overdue workers; a child also monitors parent death. Process-tree termination includes Prophet's native subprocesses.
- The default worker execution deadline is 1800 seconds, configurable through `ML_JOB_TIMEOUT_SECONDS` between 60 and 7200 seconds. This is separate from the backend's 10-second request timeout and 3-second ML health-probe timeout.
- There is one guarded asyncpg pool per process, with 1–5 connections, 10-second connection/acquisition deadlines for job operations and 30-second query deadlines. Close is idempotent and force-terminates stalled pool connections after 10 seconds. Capacity planning must include Express, ML API and child-process pools.
- MBA rule inserts and completed status commit in one transaction. Forecast writes are fenced individually; completion and product scores commit together. Failed/recovered jobs remove partial rows and reset partial forecast counters. Retention cannot delete running forecasts.

Model computation stays outside database transactions. Worker failures are not automatically replayed; a later submission can create a new job after ownership is released or expires.

## Additional confirmed forecast bug

Catalog products have UUID keys, but forecast storage and output models expected integers and the pipeline used `int(product_id)`. This prevented reliable product-level result persistence. The fix preserves UUID identity through fitting, result storage, score JSON and typed responses. Migration `20261003040000_forecast_product_ids` preserves the original integer column as `legacy_product_id` and backfills the new UUID column from matching variants. Historical rows whose variants no longer exist retain their legacy values and have a null new identity. Old score JSON remains accepted; rerun forecasting to produce current UUID-based scores.

Broad fallback writes that previously hid arbitrary database errors were removed from the modified persistence paths. Deploy the complete migration history before using this code.

## Verification evidence

- Backend: 457 tests across 13 files pass. Prisma schema validation and Client generation pass.
- Python: seven authentication/pool/busy-admission tests and eleven worker tests pass. The original unsafe pool characterization now requires exactly one initialization under ten concurrent calls.
- Real spawned Prophet work uses one UUID product, two variants and 100 synthetic sales days. Seven-day quantities/revenue, rolling scores and typed UUID output are checked. Real FP-Growth work uses 80 synthetic orders and verifies one stable promotion, UUIDs, merged ingredients and pricing. These fixtures do not connect to the business database.
- Real CPU-worker health fixture: ten in-process ASGI probes averaged about 2–3 ms, with a measured maximum around 13–15 ms. This excludes real network/TLS/proxy costs and is **not** a production readiness benchmark.
- Real PostgreSQL checks use two independent pools in a random disposable schema: twenty concurrent admissions create one owned job per type; unique constraints, owner renewal/expiry, healthy-owner preservation, failed-row cleanup, MBA rollback/publication and forecast score/status atomicity pass. UUID migration preserves legacy values, and the actual typed forecast response is checked. The schema is removed afterward; no public business rows are modified by these tests.
- All six migrations replay in a separate rolled-back schema, including ownership columns, partial indexes, UUID/legacy types and earlier financial/inventory/auth checks.

Linux process-tree behavior, abrupt parent-kill behavior, representative large-dataset memory/latency, deployed multi-instance recovery and final browser acceptance: **Not verified**. Windows spawned computation and active-worker shutdown were exercised. Full ACID/production readiness is not inferred from these selected tests.

## Deployment sequence — migrations are pending

The shared database still has four applied migrations. These two new migrations were prepared and rehearsed, **not applied**:

1. `20261003030000_ml_job_leases`
2. `20261003040000_forecast_product_ids`

Pause the old ML service after current jobs finish. From `server`, run:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

Then start the updated backend and ML service with their matching service keys. Verify admin submission, same-job attachment, status/results, UUID grouping and ingredient forecasts. Keep ML ingress private. Do not use `db push`, `migrate reset`, or generate a second migration for these already-reviewed changes.

Final acceptance cases remain consolidated in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md), with deployed/manual results NOT RUN.

## Repeatable checks

From the repository root using the installed environment:

```powershell
./ml-service/venv/Scripts/python.exe audit/ml_reproduction.py
./ml-service/venv/Scripts/python.exe audit/ml_worker_reliability.py
./ml-service/venv/Scripts/python.exe audit/ml_database_reliability.py
```

The database script creates and drops only a generated test namespace and isolates advisory keys. It requires schema-creation permission; do not substitute public tables if that permission is unavailable. From `server`, `npm.cmd test` and `npm.cmd run db:migrate:rehearse` cover backend and full migration rehearsal.
