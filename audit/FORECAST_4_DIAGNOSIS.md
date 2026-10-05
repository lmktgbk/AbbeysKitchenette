# Forecast 4: read-only diagnosis

Inspected October 6, 2026 through a repeatable-read, read-only PostgreSQL transaction.
No business data, forecasts or model settings were changed. No customer details or
database credentials are included in this report.

## Confirmed findings

Forecast 4 trained through October 5. Its stored product-week results are:

| Held-out dates | Actual units | Forecast units | Products with zero actual units | Pooled weekly R² |
| --- | ---: | ---: | ---: | ---: |
| September 15–21 | 420 | 165 | 33 / 124 | 0.6641 |
| September 22–28 | 360 | 171 | 44 / 124 | 0.6856 |
| September 29–October 5 | 7 | 168 | 118 / 124 | -205.9766 |

The newest week's actual sum-of-squared deviations is 8.6048, while squared
prediction error is 1781. Consequently R² is 1 - 1781 / 8.6048, approximately
-205.9766, displayed as -20,597.7%. This is reproducible, not a percentage-format bug.

The database has regular completed-sales records from January 1, 2025 through
September 28, 2026. After that, there is one completed order with one unit on
September 29 and two completed orders with six units on October 3. September 30,
October 1–2 and October 4–5 have no recorded completed sales. Their true demand
cannot be inferred from the absence of records.

The generator in `server/prisma/abbeys-seed/03-orders.js` explicitly starts on
January 1, 2025 and ends September 28, 2026. This confirms a synthetic coverage
boundary matching the recorded drop. Later orders' provenance remains unverified.
The current calendar logic treats the missing days as zero recorded demand.

Even before that boundary, the model underestimates menu-wide totals: 165 versus
420, and 171 versus 360. A positive cross-product R² does not remove that quantity
bias. Transformation, model settings and sparse-product behavior require an
identical-date comparison before attributing a cause.

## Receipt evidence and its limits

The generator contains 37 records labelled real slips on five dates:
September 6 (1), September 13 (9), September 18 (1), September 19 (8),
and September 20 (18), 2026. Whether these match the user's supplied receipts and
represent complete daily sales remains unverified.

They can inform observed products, variant mix and basket composition. Five
partially observed dates cannot establish two years of actual demand, seasonal
effects, or unobserved weekdays' sales volume. Synthetic extrapolation must remain
labelled separately from real receipt data and real-world forecasting evaluation.

## Recommended next steps

1. Preserve the existing database and the stored forecast for reproducibility.
2. Confirm receipt provenance and coverage before generating more synthetic sales.
3. Perform an offline as-of-September-28 benchmark on completed synthetic coverage,
   clearly labelled simulation. Do not discard genuinely observed zero-sales days
   or change the production cutoff merely to increase scores.
4. Compare product allocation, direct variant models, the same-weekday baseline,
   and justified transformation/settings alternatives on identical observations.
   Check weekly total bias alongside MAE/RMSE/MSE and individual R².
5. If a current-date demo requires additional simulated days, append a separately
   identified, reproducible simulation in an isolated dataset. Preserve actual
   receipts and reserve an untouched evaluation period. Do not wipe real receipts
   or repeat them as if they were newly observed sales.

Actual receipt files, completeness of daily business records, and accuracy of any
future receipt-informed synthetic dataset: **Not verified**.
