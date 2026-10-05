# Historical forecasting comparison

Completed October 6, 2026. Application forecasting code, saved jobs, sales and
seed data were unchanged. The benchmark read Supabase in a read-only,
repeatable-read transaction and closed its connection before fitting models.

## Comparable evaluation

All five methods predict the same held-out weeks: September 8–14, 15–21 and
22–28, 2026. Each fit uses only history preceding its held-out week. September 28
is the seed generator's explicit coverage boundary; this is a historical
experiment, not a change to the application's current-date cutoff. Results
must not be compared directly with Forecast 4, which includes a different week.

The snapshot contained 16,086 grouped sales rows. Evaluation includes 124
products and 210 variants: 372 product-weeks, 630 variant-weeks, 2,604
product-days and 4,410 variant-days. Two never-sold sample products were skipped.
Never-sold variants of scored products remain included. Every method has the
same observed total of 1,085 units.

Models use the application's existing Prophet settings. Product models allocate
predictions using variant sales shares from training history. Direct variant
models fit each variant independently; a variant with no positive training
sales receives zero predictions. Predictions become nonnegative integer
preparation plans before scoring. The baseline repeats the previous week's
same weekdays for each variant.

## Weekly product totals

Errors are units per product-week. R² is pooled across product-week observations.

| Method | MAE | RMSE | MSE | R² | Predicted units |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current product Prophet, square-root target | 1.659 | 2.760 | 7.616 | 70.19% | 500 |
| Product Prophet, raw unit counts | 1.328 | 2.047 | 4.188 | 83.61% | 949 |
| Direct variant Prophet, square-root target | 1.739 | 2.894 | 8.374 | 67.23% | 462 |
| Direct variant Prophet, raw unit counts | 1.374 | 2.095 | 4.390 | 82.82% | 934 |
| Previous same weekday | 1.667 | 2.550 | 6.500 | 74.56% | 1,059 |

Raw product Prophet reduces weekly MAE by approximately 20% and RMSE by 26%
relative to the current transform. It reduces underprediction from 585 to 136
units over the evaluated weeks. This supports changing the training target;
it does not prove that every individual product improves.

## Weekly variant totals

Errors are units per variant-week. Product model outputs here are allocations,
not independently fitted variant forecasts.

| Method | MAE | RMSE | MSE | R² |
| --- | ---: | ---: | ---: | ---: |
| Product Prophet, square-root target + allocation | 1.062 | 2.074 | 4.303 | 69.69% |
| Product Prophet, raw counts + allocation | 1.051 | 1.709 | 2.921 | 79.43% |
| Direct variant Prophet, square-root target | 1.062 | 2.066 | 4.268 | 69.94% |
| Direct variant Prophet, raw counts | 1.014 | 1.675 | 2.805 | 80.24% |
| Previous same weekday | 1.305 | 2.179 | 4.749 | 66.55% |

Direct raw variant forecasting has the strongest pooled weekly variant results,
but its improvement over raw product allocation is modest: about 3.5% lower
MAE and 2% lower RMSE. It requires more model fits. A product fit plus allocation
is a reasonable simpler option if transparently labelled.

## Daily accuracy tradeoff

| Method | Product daily MAE | Product daily RMSE | Variant daily MAE | Variant daily RMSE |
| --- | ---: | ---: | ---: | ---: |
| Product square-root | 0.318 | 0.791 | 0.203 | 0.613 |
| Product raw | 0.387 | 0.806 | 0.256 | 0.637 |
| Variant square-root | 0.321 | 0.803 | 0.198 | 0.605 |
| Variant raw | 0.388 | 0.823 | 0.250 | 0.632 |
| Previous same weekday | 0.455 | 1.005 | 0.300 | 0.797 |

Raw methods improve weekly totals while slightly worsening daily errors. The
current transform predicts fewer units, which helps errors on numerous zero
days but substantially underestimates total demand. A higher weekly R² alone
must not be presented as improved accuracy at every time resolution.

## Recommended next step

For the stated seven-day variant preparation goal, trial **direct variant
Prophet with raw unit counts**. Retain product totals as sums of variant plans,
and derive expected revenue and ingredient requirements from those same plans.
Preserve short-history handling, integer allocation, chronological evaluation
and separate weekly/daily metrics. Measure runtime and compare against the
same-weekday baseline after implementation. This is a recommendation; no
application model change has been made by this benchmark.

If simpler architecture and fewer fits take priority, trial raw product
Prophet with clearly labelled historical-share variant allocation instead.
Avoid an automatic hybrid selector until more evaluation periods justify its
additional complexity. Do not reseed sales to improve headline metrics.

## Limits and provenance

- History is predominantly synthetic. All 37 supplied random receipts (161
  units) are already embedded in the seed, alongside synthetic sales. Their
  completeness as daily records is unknown. These results demonstrate behavior
  on this dataset, not verified real-world forecasting accuracy.
- The seed hardcodes hero products, size weights and calendar patterns. Its
  comments also document earlier changes assessed against forecasting scores.
  Consequently it is not an independent real-sales validation dataset.
- These periods have already been inspected. They are diagnostic comparison
  periods, not an untouched final test set. Obtain additional complete real
  sales periods for a defensible final evaluation.
- Missing calendar dates are treated as zero recorded sales. Historical menu
  availability and recording completeness are unavailable. Do not assume
  missing records necessarily mean zero customer demand.
- Many zero observations lower average absolute errors. Pooled R² also reflects
  differences in volume between products/variants; it is not a promise that
  each individual series is predictable.
- Live performance on future real sales: **Not verified**. Runtime under
  concurrent service traffic: **Not verified**.

Full per-product scores: `results/forecast-benchmark-2026-09-28.json`.
Snapshot SHA-256:
`0e949a6b9827fdd478f1a9a7dba9a13b2eeb6b312b167a64544cb5bc724be5ca`.
Environment: Python 3.12.10, Prophet 1.4.0, pandas 3.0.5, NumPy 2.5.2.

Reproduce from the repository root (Git Bash):

```bash
ml-service/venv/Scripts/python.exe -B audit/benchmark_forecasting.py \
  --cutoff 2026-09-28 \
  --output audit/results/forecast-benchmark-2026-09-28.json
```

The command reads the current database snapshot; subsequent sales/catalog
changes can alter results. The stored checksum identifies this run's input.
Three pipeline regression tests passed, including a benchmark test that checks
matched observations and expected bias on a controlled fixture.


## Implemented pipeline verification (October 6)

The application now implements direct raw-count variant Prophet. The actual
orchestration was run against a read-only September 28 snapshot with every
persistence call mocked, validating response schemas, integer counts, revenue
consistency and matched baselines. No live forecast job was created.

Runtime was **210.02 seconds** on this laptop while other local checks were
running. This includes model fitting and evaluation, with mocked writes; it is
not an end-to-end hosting latency measurement. 124 products / 210 variants were
forecast; four never-sold sample variants in two products were skipped.

The implementation reproduced the comparator's weekly metrics:

| Target | R² | MAE | RMSE | MSE |
| --- | ---: | ---: | ---: | ---: |
| Product-week totals | 82.82% | 1.374 | 2.095 | 4.390 |
| Variant-week totals | 80.24% | 1.014 | 1.675 | 2.805 |

Full verification output: `results/variant-pipeline-2026-09-28.json`.
Normal application runs still use yesterday, not a forced September 28 cutoff.
Consequently sparse later dates can change their scores and demand predictions.
The existing synthetic-history boundary does not justify hiding later recorded
sales in production. The frontend now discloses recorded coverage gaps.

The earlier recommendation section describes the decision made before editing;
this verification records the resulting implementation. Historical-share helpers
and the square-root transform now reside only in the audit comparator.
