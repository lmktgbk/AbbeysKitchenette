# ML-service cleanup

## First batch: shared execution infrastructure

Keep the existing small feature layout. FastAPI route composition is in main.py;
config.py owns private runtime/model settings; database.py owns bounded per-process
pools; security.py owns backend service authentication; jobs.py owns admission,
lease fencing and transactional audit capture; workers.py owns spawned computation
and supervision. These responsibilities justify the separate files. No new
production abstraction or file was added, and no feature was moved in this batch.

```
ml-service/
  main.py                 # FastAPI routes and application lifecycle
  config.py               # Active runtime and model configuration
  database.py             # Per-process asyncpg pool lifecycle
  security.py             # Backend-to-ML credential boundary
  jobs.py                 # Database admission, lease checks and durable audit capture
  workers.py              # Child processes, deadlines, renewal and shutdown
  forecasting/
    routers/demand.py     # Forecast HTTP endpoints
    models/demand.py      # Forecast response contracts
    services/
      data_loader.py      # Sales, recipes and stock reads
      demand_forecast.py  # Fitting, variant splits and fenced persistence
      metrics.py          # Evaluation calculations/reporting policy
      holidays.py         # Maintained model calendar inputs
  mba/
    routers/association.py
    services/
      data_loader.py
      fpgrowth.py
```

Added professional module/function documentation around startup ordering,
initialization retries, shutdown cancellation, admission attachment, owner checks,
result-write transaction scope, process isolation, and audit rollback behavior.
Metric comments now distinguish calculation from caller-owned holdout coverage;
zero scores for insufficient observations are legacy sentinels, not proof of a
perfect model. Removed unsupported accuracy/runtime assertions from config comments.

Removed six constants with no production references: CLIENT_URL, FORECASTER_URL,
LEAD_TIME_DAYS, SAFETY_BUFFER, CRITICAL_THRESHOLD_DAYS, WARNING_THRESHOLD_DAYS.
Removed the two corresponding unused assignments from the isolated authentication
fixture. Existing active config values, SQL, leases, endpoints, payloads, model
parameters, evaluation formulas and reporting floor remain unchanged.

## Verification on 2026-10-05

- All 22 ML Python source files compile. Seven edited ML modules preserve their
  executable AST, excluding documentation and the six intentional unused removals.
- Eight authentication/pool/busy-admission tests passed (ml_reproduction.py).
- Eleven worker reliability tests passed (ml_worker_reliability.py), including
  real spawned Prophet and FP-Growth work on synthetic fixtures, health during CPU
  work, process shutdown, deadline/lease handling, UUID identity, variant totals,
  recipe merging and pricing.
- Fixtures mock database access; no business database was connected or modified.
- Real PostgreSQL regression was not rerun because SQL/transaction logic did not
  change. Live models, deployed/Linux recovery, representative load, and manual
  acceptance remain **Not verified** for this batch. No migration is needed.

The existing venv launcher points to a missing Python312 installation. Verification
used the bundled Python 3.12 runtime with the existing venv site-packages through
PYTHONPATH. No environment file, virtual environment, dependency lock, or secret
was changed. The local launcher remains unresolved; repair/recreate the environment
before relying on its documented python.exe command. Prophet emitted its optional
interactive-plot warning; fitting and test results still passed.

## Remaining review

Next inspect forecasting loaders, fitting/splitting and persistence, typed response
assembly and ingredient calculations; then MBA mining, recipe merging, pricing and
result endpoints. Consolidate only demonstrated overlap, retain useful feature
boundaries, document complex decisions, and verify every batch. This first pass
does not claim the entire ML service is refactored or production verified.
