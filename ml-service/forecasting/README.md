# Demand forecasting

The pipeline fits an independent Prophet model to each variant's daily completed
sales, using raw unit counts. Product forecasts are sums of variant plans, not
separate fitted models. Existing historical-share runs remain readable.

## Responsibilities

- `services/data_loader.py`: grouped completed-sales, current recipe and stock reads.
- `services/demand_forecast.py`: cutoff, calendars, variant models, rolling holdouts,
  coverage metadata and short lease-fenced persistence transactions.
- `services/allocation.py`: largest-remainder integer preparation planning. A variant's
  rounded weekly total is preserved when distributed across its seven daily points.
- `services/metrics.py`: daily/weekly errors; negative R² is never clipped.
- `routers/demand.py`: private job endpoints, current availability and ingredient assembly.
- `models/demand.py`: backward-compatible response contracts and coverage/evaluation metadata.

## Context and inputs

Demand means quantities sold in completed, nonremoved order items, grouped by
variant and Manila business date. Pending/cancelled orders and removed items do
not contribute. Archived products are excluded. Unavailable variants retain
historical sales; their current availability is reported separately.

All available calendar history through yesterday in Asia/Manila is loaded once.
The cutoff is frozen for a run. Each product's variants are aligned on its first
recorded date through that cutoff, with absent dates filled as zero recorded
sales. Historical availability is unknown; earlier zeros are not proof that a
new variant was on sale throughout the parent's history.

Seven calendar days since a variant's first positive sale are required to fit.
This is a minimum execution rule, not evidence of adequate statistical history.
Never-sold and more recent variants are skipped with a reason. In historical
backtests those cases receive a zero fallback and their errors remain included.

## Parameters

| Parameter | Value | Purpose |
| --- | --- | --- |
| Forecast horizon | 7 days | Whole-unit daily and weekly preparation plan |
| Minimum history | 7 calendar days since first sale | Skip unlearnable/new variants |
| Target | Raw daily units | No square-root transformation or historical mix split |
| Seasonality mode | additive | Seasonal effects add unit quantities |
| Weekly seasonality | enabled | Learn recurring weekday patterns |
| Yearly seasonality | enabled at 730 calendar days | Require about two yearly cycles |
| Changepoint prior scale | 0.02 | Conservative trend flexibility |
| Changepoint range | 0.8 | Candidate changes within first 80% of history |
| Seasonality prior scale | 2.0 | Regularize seasonal effects |
| Holiday prior scale | 10.0 | Regularize Philippine holiday effects |
| Uncertainty samples | 0 | Point forecasts only; no simulated confidence bands |
| Interval width | 0.90 | Retained Prophet setting; no interval is published |
| Holdout length | 7 days | Match operational horizon |
| Evaluation origins | 3 by default | Latest nonoverlapping hidden weeks; env `FORECAST_EVAL_ORIGINS` |
| Retained jobs | 10 terminal runs | Compare runs; running jobs are preserved |

Prophet's built-in trend is linear; remaining unoverridden settings use library
defaults. Holiday definitions are in `services/holidays.py`. No weather,
competitor prices, promotions, stockout history or external regressors are fitted.
Yearly-seasonality eligibility uses calendar span, not positive-sales-day count.

## Output calculations

Clip negative point estimates to zero. Round each variant's seven-day sum once
(half up), then use largest remainders to distribute that whole-unit total across
days. Product/day and menu totals sum these same variant counts.

Expected revenue is units × the variant price captured when loading the run,
rounded to cents. It is not guaranteed realized revenue: future promotions,
price changes and operating costs are excluded. Ingredient need uses predicted
variant units × current recipe quantities. Recipes and stock are current reads,
not historical job snapshots. Missing recipes require review, including legitimate
resale items. These calculations do not reserve stock or create purchase orders.

## Evaluation and data coverage

Each hidden week is excluded from training. Fit each variant only before that
week; score the integer plans that the kitchen would receive. Sum variant plans
for product metrics. Store daily errors and weekly total pairs for both levels.
The baseline repeats the previous week's same weekdays on identical observations.

MAE is average absolute unit error; MSE is average squared error; RMSE is its
square root. R² compares squared errors against actual-sales variation. Constant
actuals have undefined R² (N/A); negative R² remains negative. Pooled weekly R²
includes differences between variant/product volumes and is not a percentage of
correctly predicted sales. Daily errors remain visible alongside weekly metrics.

Coverage reports menu-wide dates with no positive recorded completed sales,
last recorded sale and trailing empty days. The UI shows up to fourteen recent
empty dates. It does not confirm closure, full recording or zero customer demand.
Without daily completeness information, those distinctions remain unknown.
Coverage/cutoff metadata is available on newly scored runs; old runs remain unchanged.

The existing dataset is predominantly receipt-informed synthetic history. Its
explicit simulation boundary is September 28, 2026. Keep that date for the fixed
historical comparison; normal forecasting still uses yesterday. Do not fill gaps
with invented real sales or reseed to improve evaluation scores. A demo extension
belongs in a separately identified test dataset. Real-world future accuracy and
recording completeness remain unverified. Reserve untouched complete real-sales
periods for final evaluation.

## Operations and verification

No schema migration or new dependency is required. New jobs use
`forecast_method=variant_prophet_raw` and `evaluation_version=3`. The legacy
`share` column is NULL for direct forecasts. Job progress counters still count
product groups for API compatibility; skipped rows and reasons identify variants.
Model fitting occurs in the existing child worker, outside database transactions.
Each variant is fitted once for production plus once per eligible holdout origin;
runtime depends on catalog size, history and CPU. Historical jobs are not recomputed.

From the repository root with the virtual environment activated:

```bash
python audit/ml_forecast_accuracy.py
python audit/ml_forecasting_regression.py
python audit/ml_forecast_pipeline.py
node --test audit/forecast_evaluation.test.js
python audit/benchmark_forecasting.py --cutoff 2026-09-28 --verify-pipeline --output audit/results/variant-pipeline-2026-09-28.json
```

The final command reads a snapshot and runs actual orchestration with all writes
mocked. It validates unit/revenue consistency, matched baselines and runtime.
The five-method historical comparator remains in `audit/benchmark_forecasting.py`
without `--verify-pipeline`; its old transform and mix helpers are audit-only.
Benchmark metrics on seeded history must not be presented as verified real accuracy.
