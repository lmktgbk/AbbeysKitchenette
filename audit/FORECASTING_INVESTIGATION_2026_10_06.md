# Forecasting investigation — October 6, 2026

Application code, model configuration, seed data and database rows were not modified.
The investigation used explicitly read-only database transactions and local fits;
no forecast job was created. This report does not authorize implementing the prototypes.

## Evidence and protocol

- Stored forecast job **1**: completed, 124 products, 210 variants, no failed/skipped
  results and no legacy share allocations. Runtime: **632.3 seconds** (~10.5 minutes).
- Completed-sales snapshot: **January 1, 2025–October 5, 2026**, 643 calendar days,
  42,902 units, no menu-wide missing dates. There are 21,187 synthetic orders and
  37 receipt reconstructions. Receipt prices/timestamps remain estimated.
- Dataset SHA256: `3df0fbeab89ee582337db5bd70af36e84bd2867227eaf4264fb299491f91c766`.
- Tuning: **June 8–28, 2026**, three nonoverlapping seven-day rolling holdouts.
- Reserved comparison: **July 6–26, 2026**, also three rolling holdouts. Choices
  were locked using June weekly product MAE, with RMSE as a tie-breaker, before
  inspecting July results. Later test weeks may use earlier observed weeks in
  their training prefixes, as ordinary rolling-origin evaluation permits.
- October's already-observed September 15–October 5 windows were diagnostic only.
  The subsequent allocation prototype was tested only diagnostically, after selection.
- All candidate fits used independent variant targets. Product predictions are sums.
  Same dates, zeros, variant eligibility and integer preparation conversion apply.
  No holdout values enter a fit or same-weekday average.
- Python 3.12.10, Prophet 1.4.0, NumPy 2.5.2 and pandas 3.0.5. Package versions and
  application-source fingerprints are retained in `summary.json`.

## Confirmed findings

### 1. Evaluation arithmetic reproduces the displayed scores

Stored product-week R² is **65.9141%**, MAE **1.7823**, RMSE **2.5257**, MSE **6.3790**.
Variant-week R² is **58.4109%**, MAE **1.2873**, RMSE **1.9178**, MSE **3.6778**.
There are 372 product-week and 630 variant-week pairs. These reproduce the user's
rounded display. The baseline uses the same actual observations. Zero values
are retained; constant actual series have undefined R² rather than fabricated 0/100%.

Locations: `ml-service/forecasting/services/metrics.py`,
`demand_forecast.py:evaluate_product`, `client/src/features/forecasting/evaluation.js`.
Existing checks passed: 10 accuracy/allocation tests, 11 response/data-boundary
regressions and six frontend evaluation tests (27 total). Live model comparison
is recorded separately and is not inferred from those tests.

### 2. Daily badges score preparation counts, not unrounded model expectations

111 of 124 products in the stored job have negative daily R²; one is unscorable.
Those badges pool **21 daily observations per product**. The headline instead
pools **three seven-day totals across 124 products**. It can benefit from knowing
which products sell more, without predicting each product's daily fluctuations well.
65.9% R² is not a percentage of correct orders or a per-product accuracy guarantee.

`predict_units()` clips expected `yhat`, rounds each variant's weekly total, then
apportions whole counts across days before daily evaluation. In the reserved July
comparison, current Prophet has pooled daily product R² **−5.2%** using preparation
counts versus **20.0%** using unrounded expectations; RMSE is **0.965 vs 0.842**.
MAE does not improve in this comparison (0.598 vs 0.601), and 85 individual products
still have negative daily R² with unrounded expectations. Rounding is therefore a
confirmed contributor, not the entire explanation or a guarantee of positive scores.
Neither target should silently replace the other. Both should be labeled and scored.

### 3. Sparse demand makes individual daily outcomes difficult

201 of 210 variants average less than one sold unit/day. The median is **0.194/day**;
22 average less than one/week. The generator uses fixed receipt-informed weights,
weekday traffic and independent random basket draws; it does not generate a real
trend or measured holiday effect. Not all fluctuations contain forecastable signal.
A negative individual R² compares against the actual holdout mean, which would not
be known at prediction time. It must be considered alongside matched operational
baselines, MAE and RMSE rather than treated as automatic proof of a broken model.

### 4. Receipt reconstruction creates an extra-volume week

September 15–21 contains **27 receipt samples / 113 units**, appended to synthetic
sales. Total observed units are **571**, versus **459** and **450** in the next weeks.
Current forecasts sum to 1,359 versus 1,480 observed across all three holdouts:
**121 units under**, or **8.2%**. The appended receipt volume accounts for much of
that aggregate discrepancy, but this arithmetic is not a causal decomposition of
individual forecast errors. Keep the samples and report the differing weeks;
do not remove them just to increase evaluation scores.

### 5. Independent rounding can concentrate variants on the same day

For resale soft drinks in September 29–October 5, the current aggregate model
expects about **0.86 bottles on Saturday**, while separate variant allocations put
**three bottles** there. The daily product score is **−358%** after rounding versus
**−35%** for unrounded expectations across the three diagnostic weeks.
This is a planning/allocation effect, not evidence that the model directly predicted
three bottles on that Saturday. Variant weekly totals remain correctly preserved.

A local greedy balancing prototype preserves each independent variant's rounded
weekly quota and product daily totals apportioned from summed expectations. It
consults no actual outcomes. It is not a globally optimal transportation solver.

| Diagnostic product | Current daily RMSE | Balanced daily RMSE | Result |
| --- | ---: | ---: | --- |
| 1.5L Softdrinks (Resale) | 1.397 | 0.951 | Improved |
| Caramel Macchiato | 2.035 | 1.964 | Improved |
| Spanish Latte | 2.410 | 2.563 | Worsened |
| French Fries | 1.704 | 1.589 | Improved |
| Mini Donuts | 1.826 | 1.380 | Improved |

These are five selected October examples, **not an untouched whole-menu test**.
Spanish Latte worsens; no blanket benefit is established. Whole-menu evaluation
on a newly reserved period is required before adopting this allocation change.

## Model comparison

The simplest winning Prophet candidate uses **flat growth, additive weekly
seasonality, seasonality prior 0.1, no yearly/daily seasonality, no holiday terms,
all historical training days, and no uncertainty simulation**. These settings change
multiple assumptions together; the experiment does not isolate which setting
caused each difference. A 26-week flat candidate and 8-/26-week weekday averages
were also benchmarked. Existing current parameters were not edited.

The flat-full candidate won June weekly MAE (1.548 versus current 1.594). July:

| Method | Pooled product-week R² | MAE units/week | RMSE | MSE |
| --- | ---: | ---: | ---: | ---: |
| current | 62.1% | 1.634 | 2.231 | 4.978 |
| flat_full | 65.3% | 1.548 | 2.135 | 4.559 |
| previous_week | 36.9% | 2.153 | 2.881 | 8.298 |
| weekday_8w | 62.4% | 1.659 | 2.223 | 4.944 |
| weekday_26w | 63.6% | 1.583 | 2.187 | 4.782 |

The selected Prophet reduces July weekly MAE by **5.3%** and RMSE by **4.3%** versus
current, with R² increasing by **3.2 percentage points**. Variant-week R² rises from
**54.1% to 57.3%**. It beats the evaluated baselines, but the improvement is modest:
rounded daily product R² is still −5.2%. No significance claim or 80% target is made.
The simpler settings should not be assumed best for a future cafe with real growth,
holidays or changing customer behavior merely because this stationary simulation
favored them. Three test weeks and one generator limit generalization.

## Proposed next batch — requires discussion before application edits

1. Clarify UI labels: **daily preparation R²**, **pooled weekly R²**, and the matched
   baseline. Keep negative and unavailable values honest and visible.
2. Retain raw expected demand as well as whole preparation counts. Score each
   explicitly, including versioned historical response handling. Revenue and
   ingredient preparation totals must remain consistent with their declared target.
3. Benchmark the balanced allocation across the full menu on a newly reserved
   chronological period. Preserve every independent variant's weekly total;
   do not return to unexplained historical percentage splitting.
4. Consider the simpler Prophet configuration as a candidate, rather than deploying
   it solely to raise R². Verify additional periods and compare sparse/popular items.
5. Keep data fixed, rerun regression/conservation checks, then test the complete
   frontend→API→ML→forecast→recipe path. No stock reservation or purchase is implied.
6. Evaluate MBA separately after forecasting behavior is understood.

## Additional operational concern

`data_loader.py:load_current_stock` includes positive batches without checking expiry.
The ingredient endpoint also uses average coverage rather than dated batch depletion.
Consequently coverage can include already-expired stock, or stock that expires before
its planned use. This code-path risk is confirmed; a live expired-stock reproduction
was **Not verified** here. Address separately with expiry-aware stock requirements.

## Reproduction and limits

Run `ml-service/venv/Scripts/python.exe audit/investigate_forecasting.py` from the
repository root. It uses the immutable cached `sales_snapshot.csv.gz` when present,
otherwise reads completed sales using the existing read-only snapshot loader.
`audit/diagnose_preparation_allocation.py` runs only on that cached snapshot.
On this Windows host, normal subprocess/event-loop permissions were required;
sandbox-only runs stalled and were stopped. No application process was stopped.

`summary.json` retains metrics, paired diagnostic dates, raw/rounded predictions,
protocol and stored job verification. The compressed snapshot contains catalog
metadata and grouped daily units, not customer names, passwords or tokens.
Intermediate tuning/reserved-test JSON is reproducible and omitted from the commit.

This is overwhelmingly synthetic receipt-informed data. Receipt samples informed
popularity assumptions and are not an independent real-world validation set.
No reseeding, application edits, deployment change or database mutation was performed.
Live cafe accuracy, hosting performance and improvements beyond the examined periods
remain **Not verified**.
