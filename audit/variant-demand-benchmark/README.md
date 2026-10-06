# Expected-demand variant benchmark

Production forecasting and database records remain unchanged. The frozen snapshot
contains 124 products, 210 variants and 42,902 completed units through October 5,
2026; most sales are synthetic.

Selection uses unrounded variant-week MAE, with RMSE as the tie-breaker, on three
June weeks. The exact dataset hash is checked before reusing the earlier June
fits. The selected configuration is written before August evaluation starts.
August scores are a later historical comparison, not a live validation trial.

Candidates: current Prophet; flat-trend Prophet with full history or 26 weeks;
weekday means over 8 or 26 weeks; previous-week carry-forward. The simpler Prophet
uses additive weekly seasonality, prior scale 0.1, no daily/yearly seasonality,
no holiday effects and no uncertainty simulation. All forecasts are clipped at
zero and retain fractional expected units. Missing dates are zero recorded sales.

The holdout evaluates three nonoverlapping seven-day windows ending August 23,
2026. Each fit excludes its own holdout. Variants remain the primary target;
product totals are secondary aggregations. No seed changes or score thresholds
are used to select the result. October scores already viewed by the user are not
used for selection. Reusing an exploratory dataset does not make this a blind
external test; real future sales are still needed for that.

Run from the repository root:

```powershell
ml-service/venv/Scripts/python.exe audit/benchmark_expected_variants.py
```

See `summary.json` for the locked choice and matched tuning/holdout scores.

## Results

Three August holdout weeks, 630 matched variant-week observations:

| Method | Variant weekly R² | MAE | RMSE | MSE |
| --- | ---: | ---: | ---: | ---: |
| Current Prophet | 55.17% | 1.2608 | 1.7319 | 2.9996 |
| Selected flat-trend Prophet | 57.03% | 1.2399 | 1.6957 | 2.8752 |
| Previous-week baseline | 14.74% | 1.7365 | 2.3885 | 5.7048 |

The selected Prophet lowers MAE by 1.7%, RMSE by 2.1% and MSE by 4.1%.
Its aggregated product-week R² is 67.51%, versus 65.92% for current Prophet.
These are August benchmark values, not the application's October run scores.

Recommendation: the simpler configuration is a modest candidate, not a route to
75% variant R² on the evidence available. Preserve honest metrics and make variant
metrics the primary presentation. Before broad tuning, inspect per-variant demand
sparsity and confirm the forecasting target. Forecasting product demand with
estimated variant shares is a different model and cannot be reported as direct
variant forecasting. Synthetic seed changes intended to force 75% are not warranted.
Actual complete sales and further independent periods are needed to establish
real operational accuracy. No production changes were made in this benchmark.
