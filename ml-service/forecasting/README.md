# Demand forecasting

The demand pipeline fits Prophet to product sales and allocates whole-unit
preparation quantities to variants. An allocated quantity is not an independent
variant Prophet prediction.

## Responsibilities

- `services/data_loader.py`: grouped completed-sales, current recipe and stock reads.
- `services/demand_forecast.py`: completed-day calendar, fitting, rolling holdouts
  and short lease-fenced persistence transactions.
- `services/allocation.py`: historical mix and integer allocation. Weekly product
  counts equal the rounded expected weekly total; variant quotas and daily totals
  remain consistent.
- `services/metrics.py`: held-out error calculations without clipping negative R².
- `routers/demand.py`: job endpoints, current availability and ingredient assembly.
- `models/demand.py`: response contracts, including nullable R² and allocation scores.

## Data and evaluation rules

Training includes available history through yesterday in Asia/Manila. Removed
order items, noncompleted orders, today's sales and archived products are excluded.
Variant unavailability does not erase historical sales. Never-sold variants remain
visible with zero allocations or a skipped product result; zero allocation is not
proof that future demand is zero.

Variant shares use the 30 calendar days ending at the training cutoff. If that
window has no sales, use earlier recorded history. Evaluation repeats this rule
at each historical origin; held-out sales never determine shares.

The preparation plan is also scored, so rounding is part of the evaluation.
Daily product and allocation metrics pool nonoverlapping hidden seven-day periods.
Weekly product totals are retained for menu-wide aggregation. The client compares
Prophet and the same-weekday baseline on matching product-week observations,
including correct zero-sales predictions. Negative R² is retained; constant
actuals have undefined R² and show N/A. MAE/MSE/RMSE can still be evaluated.

The pooled weekly R² includes between-product volume differences. Individual
daily product and allocated variant scores are shown separately. These metrics
must not be described as a percentage of correctly predicted sales.

Recipes and stock are current reads, not snapshots of a historical job. Missing
recipes require review because there is no catalog flag reliably distinguishing
recipe-free resale items from accidental omissions. Revenue uses the variant
price captured when forecasting, excluding future promotions and operating costs.
Demand can include currently unavailable variants; availability is shown separately.

## Limitations and operations

Missing sales dates currently mean zero recorded demand. Closure, stockouts and
missing records cannot be distinguished without additional historical data.
Seven calendar days allow a fit; they do not establish statistically sufficient
history. Evaluation requires a separate completed holdout and training history.

The latest ten terminal jobs are retained so an earlier run can be reviewed while
testing changes. Existing rows are not recomputed. No schema migration is needed.
Product-plus-allocation remains the production method. Direct variant Prophet
comparison is a separate experiment, not an automatic extra fit for every request.
From an activated virtual environment at the repository root, compare one product:

```bash
python audit/compare_forecast_methods.py --product-id PRODUCT_UUID
```

This command reads sales and prints daily/weekly product and variant metrics as
JSON. It does not save jobs or change business data. Variants with no training
sales use a zero forecast in the direct approach, which must be disclosed in a
capstone comparison. Freeze the evaluation dataset before model selection and
reserve a later untouched period for the final reported evaluation.

Regression commands from the repository root:

```bash
python audit/ml_forecast_accuracy.py
python audit/ml_forecasting_regression.py
python audit/ml_forecast_pipeline.py
node --test audit/forecast_evaluation.test.js
```

The pipeline test fits real Prophet to synthetic sales and mocks every persistence
operation. The PostgreSQL test `audit/ml_database_reliability.py` uses a disposable
schema and removes it afterward; it requires the server's direct connection.
