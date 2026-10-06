# Controlled 30-order demonstration dataset

This is a separate export, not a replacement of the current Supabase database.
The original seed and its extension behavior are unchanged. The preview exporter rejects `--apply`. The approved database-import command is
`npm run seed:demo:forecast` from `server/`; see the seed README for reset/resume commands.

## Simulation assumptions

- January 1, 2025 through the last completed Manila day (October 5 for this run).
- Target 30 synthetic orders/day; normalized weekday weights create quieter weekdays
  and busier weekends. Real receipt samples are added on top.
- Weekly traffic varies +/-8%; annual demand varies smoothly +/-5%. Template weights
  vary +/-10% weekly. These are declared demo parameters, not measurements.
- Fixed food/drink templates generate two or three items per order, with duplicate
  selections merged as item quantities. Receipt-informed template weights use
  `1 + sqrt(sample units)`; receipt-inspired combinations get weight 3.
- Whole-week basket quotas intentionally reduce independent sales noise. This makes
  predictable weekly patterns for a teaching demonstration. It is a controlled
  simulation, not proof of accuracy on actual restaurant sales.
- The selected 37 receipts remain unchanged via the existing transcription path.
  Synthetic copies of their combinations are capped at three units and labelled
  separately; actual samples retain their original quantities and dates.
- Same catalog, recipes and estimated costs as the existing seed. Recipes deduct
  declared ingredients once. Manual cash/Maya/GCash payments; no payment integration.
- Exact-payment completed orders, no discounts/refunds, zero shift cash variance.
  Estimated purchases cover each day's exact consumption; historical batches end
  empty. One positive closing batch per ingredient covers at least 1.5 times its
  minimum threshold or three largest portions. These are simulated stock ledgers,
  not records of actual inventory or business expenditure.

## Reproduce without database access

From `server/`:

```bash
npm run seed:demo:preview -- --through=2026-10-05
```

From the repository root:

```powershell
node audit/check_demo_dataset.mjs
ml-service/venv/Scripts/python.exe audit/benchmark_demo_dataset.py
```

Generated CSV, JSONL baskets and detailed stock operations are ignored by Git;
source plus summary/benchmark reports are retained. Output contains no credentials
or customer names. Product and variant IDs are simulation identifiers, not a claim
that they match the current database's auto-incremented variant IDs.

## Evaluation protocol

Compare existing Prophet and flat-trend/full-history Prophet. The latter has weekly
additive seasonality, seasonality prior 0.1, no yearly/daily/holiday effects, and no
uncertainty simulation. Training data and calendar zero filling are identical.
Select using June's variant-week MAE, then RMSE. Record the choice before evaluating
three August weeks. Both methods and the previous-week baseline are reported on
630 matched variant-week totals; product metrics are secondary sums. No seed
parameters are altered in response to benchmark scores. No 75% score is promised.

MBA runs the existing FP-Growth pair miner: support 0.005, confidence 0.08, lift
strictly greater than 1.1. Oldest 80% of calendar days train rules; newest 20% check
support, confidence and lift using existing production stability thresholds.
Support/confidence/lift describe associations, not classification accuracy.
Planted templates naturally generate stable associations; they do not establish
real-world buying relationships.

Read `summary.json` for dataset totals and `benchmark.json` for the comparison.

## Completed August benchmark

630 matched variant-week observations (three hidden weeks, all 210 variants):

| Model | Weekly variant R² | MAE | RMSE | MSE |
| --- | ---: | ---: | ---: | ---: |
| Current Prophet | 87.56% | 0.6629 | 0.8543 | 0.7299 |
| Simpler flat-trend Prophet | 88.51% | 0.6336 | 0.8210 | 0.6740 |
| Previous-week baseline | 74.97% | 0.8587 | 1.2117 | 1.4683 |

June selected the simpler model; it also improved August MAE by 4.4%, RMSE by 3.9%
and MSE by 7.7% compared with current Prophet. Weekly R² exceeds the stated 75%
target on this controlled dataset. Daily variant R² is only 26.54% for the simpler
model (25.99% for current Prophet); high pooled weekly R² is not a guarantee of
individual daily accuracy. Pooled R² includes differences between variant volumes.

MBA mined 126 pairs from 15,569 older orders and verified them against 3,840 recent
orders. All 126 passed the existing temporal stability conditions. These planted
synthetic relationships are not independently discovered real customer preferences.

Recommendation: the simpler model is suitable for this explicitly labelled
controlled demonstration, with weekly variant metrics as the primary evaluation.
The selected configuration is now implemented as evaluation version 5 with method
`variant_prophet_expected_flat`. The user will apply the database seed locally;
the current public Supabase data has not been reset by this implementation step.
These August results are not the application's October results. The full latest
production run, actual database import and browser verification remain **Not verified**.
Database replacement and the model switch were approved; stop services before
running the documented import locally.
