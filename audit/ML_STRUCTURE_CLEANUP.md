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

## Second batch: forecasting reads and response assembly

Four existing production files changed; no new production file or architectural
layer was introduced. Added a local _job_summary converter for results/history
instead of maintaining two copies of timestamp and public-field assembly.
Ingredient needs now index recipe groups and first stock rows once per request,
rather than repeatedly filtering whole DataFrames. Variant persistence now uses
its enumeration index to read the aligned share_list instead of searching IDs
again for every variant. SQL statements and transaction boundaries did not change.

Added professional documentation for loader filters and empty-frame contracts,
product counters under the legacy total_variants name, current-recipe/current-stock
semantics, per-day rounding before totaling, missing-stock behavior, live-owner
writes, skip replacement, retention, holdout fitting, square-root transforms,
calendar filling, and result publication. Corrected comments implying that gap
padding normally caps zero history or that rolling origins are a mandated third-
party procedure. Forecasting still zero-fills through today's Manila date and
then predicts future days using the existing model code.

Existing boundaries are explicit: absent sales dates are treated as zero demand;
this does not distinguish store closures or missing data. Ingredient reads use
current recipes/stock, can see partial rows while a job is running, and stock sums
have no expiry filter. These behaviors were documented, not changed. Response
field names, model settings, fitting/transforms, allocation arithmetic, holdout
metrics, quantity rounding, statuses, UUID identity and lease fencing remain.

Verification on 2026-10-05:

- Nine new isolated regression cases in ml_forecasting_regression.py passed:
  shared recipes, daily rounding, output order, duplicate stock first-row behavior,
  empty stock, missing recipes/variants, no-result short circuit, job summary field
  boundaries, matching history/results, not-found responses, empty loader columns,
  date conversion and UUID identity.
- Sixty seeded ingredient datasets matched the pre-cleanup router response exactly
  in a one-off comparison using mocked reads; no real database was connected.
- Eight existing ML auth/pool/admission and eleven worker reliability tests passed,
  including synthetic spawned Prophet and FP-Growth work: 28 tests in total.
- All 22 ML source modules compile. Loader/schema executable ASTs are unchanged;
  pipeline AST differs only in the intended share indexing optimization. Router
  changes are covered by response regressions and the baseline comparisons.
- No schema migration, dependency change, business-data write, or active model run.
  Representative performance/load, live UI/data reconciliation, expired-stock
  business policy, Linux/hosted behavior, and production accuracy are **Not verified**.
  Repeated scans are removed, but no production latency improvement is claimed.

Tests use the compatible bundled Python 3.12 plus existing venv packages as in the
first batch; the broken local venv launcher remains unchanged. Next review is the
MBA pipeline and endpoints. The full ML cleanup remains unfinished.

## Third batch: market-basket calculations and endpoints

Three existing production modules changed, with no new production layer/file.
Removed an unreachable return after _is_stable and unused MIN_CONVICTION (the
pipeline reports conviction but never filters by that constant). The fixed 15%
bundle discount now has one definition in its existing loader module. Catalog
recipe groups are indexed once by the existing name/size label instead of scanning
the full DataFrame twice per rule; pure detail conversion is now synchronous.

Consolidated duplicate extended/legacy rule SELECTs into one local helper using
fixed column strings and a bound job ID. Compatibility fallback catches only
asyncpg UndefinedColumnError; outages, missing tables, and other failures propagate
without a misleading second query. Both SQL selections and parameters match the
previous queries after whitespace normalization. Persistence, lease checks,
publication transactions, authentication, and ordered pair association are intact.

### Confirmed pricing bug fixed

With recipe cost 31, min_price is 32. Combined menu prices 15+15 at 15% discount
produce 25.50; the old max-then-nearest-five calculation rounded 32 down to 30.
The updated code raises such a result to the next multiple of five (35), enforcing
the recipe-cost-plus-one floor after rounding. Normal nearest-five suggestions,
input costs/prices, and discount formula remain unchanged. This affects new
suggestions only: historical results and saved product prices are not rewritten.
The recipe floor excludes overhead and does not guarantee profitability or
restrict manually edited product prices.

Professional comments explain presence rather than quantities in basket matrices,
requested thresholds, mirror-pair deduplication, fixed discount behavior, current
recipes and historical weighted costs, recipe units/first-cost metadata, reported
stability, nonfinite conviction, temporary rank IDs, JSON decoding, completed-only
reads, missing-column fallback and transactional combo audit capture.

Existing boundaries remain explicit: variant identity in mining/detail lookup is
a product-name/size label and can collide; created-pair tracking uses an ordered
product-name pair rather than unordered variant identity. Catalog inner joins omit
variants without recipes, and costs use historical quantities added rather than
only current/usable stock. Stability is reported for all retained rules and does
not filter the list. Those behaviors were documented, not silently changed.

Verification on 2026-10-05:

- Fourteen new isolated MBA regressions passed: floor/rounding boundaries, normal
  pricing, recipe quantities/costs, basket presence, real FP-Growth metrics/mirror
  deduplication, missing recent items, indexed detail UUIDs/rounding, missing-column
  fallback, no outage/missing-table retry, unpublished/missing jobs, completed JSON
  responses, empty loaders and the shared discount constant.
- Eight auth/pool/admission, nine forecast response, and eleven worker reliability
  tests passed: 42 tests total, including spawned synthetic Prophet and FP-Growth.
- One-off seeded baseline comparisons: 360 variant lookups matched exactly; 1,200
  price cases retained all other fields and unchanged suggestions wherever the old
  suggestion already met the floor. Both extended and legacy SQL/parameters and
  empty completed responses matched baseline.
- All 22 ML source modules and the new regressions compile; diff whitespace checks
  passed. No business database connected/written, no migration/dependency change.

Real PostgreSQL execution of the consolidated SELECTs, live suggestion/browser
flows, large-catalog memory/latency, production model accuracy and hosted/Linux
recovery remain **Not verified** for this batch. Verification continues to use the
compatible Python runtime plus existing packages; the old venv launcher is not
repaired. Remaining work is a final ML integration/documentation review and broader
regression, followed by the consolidated manual acceptance.

## Final integration review — 2026-10-05

The holiday module now documents its actual coverage and host-year boundary,
without changing dates or model behavior. Its executable AST matches the prior
version. Calendar completeness and current official holiday dates remain **Not
verified**. Route comments now describe fallback polling and failed history jobs
accurately; no endpoint behavior changed in this documentation pass.

Broader verification passed: 854 Vitest tests (119 skipped), client production
build and ESLint, shared-source deployment layout, all 42 Python regressions,
and compilation of 22 ML source modules. Skipped tests are not passing evidence.
The existing virtual-environment launcher remains broken; Python checks used the
compatible bundled Python 3.12 runtime with the existing installed packages.

The isolated PostgreSQL reliability script also passed: legacy UUID migration,
20 concurrent admissions across two pools, expired-owner recovery, MBA rollback
and publication, stale-owner protection, atomic forecast metrics/status, and
empty/failing forecast pipeline handling. Only its randomly named disposable
schema was modified, then removed. This does not verify hosted operation or every
database-dependent test skipped by the ordinary suite.

The seven opt-in backend/Python PostgreSQL integration tests also passed, covering
report, reorder, waste and automation transaction behavior plus the cross-language
durable effect contract. Their fixture creates and removes a separate disposable
schema; this run does not replace the other 112 skipped database tests.

An existing integration mismatch remains: authenticated admin GET
`/api/market-basket/analyze` forwards GET to `/mba/analyze`, but Python exposes
only POST there. Expected upstream response is 405; that live HTTP response is
**Not verified** in this pass. The current frontend uses POST through its queued,
durably audited mutation flow. Do not change the legacy GET into an unaudited
job-starting action merely to suppress the error. Deprecate it with an explicit
405/Allow response, or define and test a deliberate compatibility contract in a
separate functional change.

Live browser workflows, provider delivery, hosted/Linux worker recovery, load
limits and model accuracy remain manual/deployment acceptance work. The final
checklist is the source for those pending cases; these results do not establish
production readiness or zero regressions.
