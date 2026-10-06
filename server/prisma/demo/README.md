# Fresh capstone demonstration data

`../demo-seed.js` is the entry point. `catalog.js` contains menu, ingredient and
recipe assumptions; `receipts.js` contains the 37 transcribed samples; `plan.js`
generates deterministic sales; `write.js` persists the accounting and stock ledger.
The older `abbeys-seed` scripts remain historical audit evidence. Do not mix them
with this workflow, or run the older `npm run reset` command.

## What is real and what is estimated

- Product prices and menu groups come from the supplied client menu. Names are
  normalized to existing application names, with `(Platter)` distinguishing shared
  dishes from solo meals. Flavored French Fries retain the sizes found in receipts.
- The 37 samples contain 161 units. Original quantities, variants, tables, payment
  methods and supplied names are preserved. They are **samples**, not proof of a
  complete business day. Unspecified year is interpreted as 2026.
- Sample receipts have no supplied price/payment amount/service timestamp. Their
  values use the current supplied menu, exact payment and zero discount/change.
  Times, preparation duration, cashier and shift are estimated. Consequently these
  are reconstructed sample orders, not exact historical financial statements.
- Recipes, purchase prices, thresholds, shelf lives, stock and operating hours are
  **all estimates**. Portions are in the ingredient's base unit. Dry rice portions
  are about one third of cooked serving weight. Prepared Katsu is deducted directly;
  its raw chicken and breading are not deducted again.
- Supplemental ingredients absent from the client list are inferred: dry rice,
  matcha/cocoa/ube/red-velvet/cookies-and-cream powders, Yakult, cream cheese, bottled
  resale drinks, canned Coke, ready-to-drink pineapple juice, squid, shrimp, nacho
  chips, chicken feet/neck and miso. Product identity and spelling normalization do
  not confirm a supplier, brand, preparation method or portion. Review `catalog.js`
  before treating any recipe/cost as an operational specification.
- Purchases use estimated base-unit costs, not live market quotations. No rent,
  payroll, utilities, VAT or packaging overhead is invented. Ingredient margin is
  not net profit. Resale 1.5L bottles have estimated ₱75 acquisition cost.

## Simulation parameters

Start: **January 1, 2025**. End: yesterday in **Asia/Manila**, or `--through=YYYY-MM-DD`.
Never include today or future days. Generated IDs and random draws are date based,
so extending does not change previously generated orders.

Base traffic is 30 baskets/day. Sunday–Saturday multipliers are 1.30, 0.85, 0.90,
1.00, 1.05, 1.20, 1.40, with daily noise of 0.80–1.20. First-item selection is 60%
drink and 40% food. A second complementary food/drink item occurs in 65% of baskets;
15% receive another independently chosen item. Each selection has a 12% chance of
quantity two. Variant sampling weight is `1 + quantity in supplied receipt samples`.
This smooths sparse examples and allows unsampled items to sell. It does **not**
establish measured customer preferences or demand elasticity.

75% of synthetic payments are cash; the rest split between manual Maya and GCash.
No gateway or webhook is used. Orders are completed, undiscounted and fully paid.
One closed admin shift per day starts with ₱1,000 cash; expected/actual cash include
cash sales only and variance is zero. Synthetic service is 16:00–22:29 plus 20-minute
completion. Demo opening hours are 16:00–23:59. This dataset intentionally does not
pretend to test cancellation, refunds, discounts or staff attendance.

Stock is replenished to cover each day's recipe shortage, consumed FIFO, and linked
to order **items** and batches. This simplified just-in-time simulation creates many
exhausted historical batches. After the final day, each ingredient has one positive
batch, stocked to the larger of 1.5× threshold or three largest recipe portions.
Unused ingredients still get closing stock. Extension records expired closing stock
as an expiry loss before replenishment. Stock history is never merged or rewritten
to hide discrepancies. Foreign manual batches with multiple positive remainders
cause finalization to stop rather than silently destroying that history.

## Running locally (Git Bash)

Stop the backend and ML service first so workers and manual requests cannot write
during reset/extension. Apply pending migrations and generate Prisma before seeding.
Put `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD` (minimum 12 characters) in the
server's uncommitted `.env`; use your chosen credentials, not a committed password.

```bash
cd server
npm run seed:demo -- --through=2026-10-05
```

That command only previews: it does not connect to or modify Supabase. Review the
catalog and preview. The following **deletes Prisma application rows**, including
users, and recreates the demo admin. It preserves schema, migration history and
Supabase's separate auth/storage schemas. Existing Cloudinary assets and Google
Sheets rows are external data and are not deleted or replayed by this command.

```bash
npm run seed:demo -- --through=2026-10-05 --apply --confirm=RESET_SMARTCAFE
```

Before defense, replace the date with the last completed Manila date:

```bash
npm run seed:demo:extend -- --through=2026-10-25
npm run seed:demo:extend -- --through=2026-10-25 --apply
```

An extension keeps existing orders/checkpoints, including manual test orders. It
refuses changed seeded recipes/prices; reassess the simulation instead of quietly
replacing operational edits. Never extend backward. Each day's transaction either
commits all sales, deductions and shift checkpoint, or rolls back. If interrupted,
resume using extension mode. A session advisory lock prevents overlapping seed runs,
but cannot stop ordinary application traffic: stopping the services is required.
Bootstrap/reset is atomic; the entire multi-month seed is not one giant transaction.
Expect several minutes depending on database network latency.

## Evaluation and checks

Run `npm test -- tests/demoSeed.test.js` for deterministic plan checks. On PowerShell,
`$env:DEMO_DB_CHECK='1'; npm test -- tests/demoSeed.database.test.js` uses the existing
isolated-schema helper and drops only that temporary schema afterward.

After seeding, restart services, verify login/products/inventory/orders/dashboard,
then generate forecasting and MBA using the application. Neither pipeline is run
automatically during seeding. Forecasting remains independent variant Prophet,
seven-day demand, aggregated into product revenue and recipe requirements. Model
parameters and evaluation code are unchanged by this seed. Use chronological held-out
weeks and matched carry-forward baselines; evaluate MBA support, confidence and lift
on unseen baskets where supported. Report the date range, synthetic proportions and
receipt-informed sampling. Receipt examples influenced the generator, so they are
not an independent real-world test set. No R² target is promised or built into the
generator, and mixed synthetic/receipt results cannot establish live cafe accuracy.


## Separate 30-order forecasting preview

`npm run seed:demo:preview -- --through=2026-10-05` exports a controlled synthetic
profile without opening a database connection. It does not change `seed:demo`.
Its fixed weekly basket quotas intentionally reduce noise for teaching; see
`../../../audit/forecast-demo-dataset/README.md` for assumptions and benchmarks.
Do not use the destructive original seed command to import this preview profile.


## Apply the approved forecasting profile

Stop the backend and ML service first. From `server/`, preview, then apply:

```bash
npm run seed:demo:forecast -- --through=2026-10-05
npm run seed:demo:forecast -- --through=2026-10-05 --apply --confirm=RESET_SMARTCAFE
```

The second command replaces Prisma-owned application data and creates the admin
from existing `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` (minimum 12 characters).
Supabase auth/storage and migration history remain outside the reset table list.
Each business day is one transaction. If interrupted, resume **without resetting**:

```bash
npm run seed:demo:forecast -- --mode=extend --through=2026-10-05 --apply
```

Use the same profile for later extensions with a newer completed-day cutoff.
The original `seed:demo` default remains the legacy generator. Cross-profile
extension is refused before any day writes. Catalog IDs/receipt transcriptions
remain unchanged; profile-specific sales and checkpoint markers distinguish this
simulation. Purchase/deduction/accounting logic is shared with the existing writer.
Restart services after completion, sign in with the configured demo admin, then
run demand forecasting and MBA. Latest October scores are not the August benchmark.


## Lower-traffic profile (forecast-demo-v2)

The forecast profile now targets **10 synthetic orders/day**, with the same basket
and inventory rules and the 37 unchanged receipt samples. Weekly traffic is derived
from `averageOrdersPerDay * 7`. Actual receipt samples are added on their original
dates, so those days may exceed the synthetic target. Rare variants may have no
sales; they remain in the catalog and forecasting can legitimately skip them.

Switching from the 30-order profile requires a fresh reset, not `--mode=extend`:

```bash
npm run seed:demo:forecast -- --through=2026-10-05 --apply --confirm=RESET_SMARTCAFE
```

Stop backend/ML first, then restart and regenerate forecasting/MBA afterward.
Use extend only after this new profile is initialized. Historical 30-order benchmark
scores do not apply to this changed volume. Lower traffic does not guarantee a
particular forecast revenue or R²; revenue also depends on basket sizes/menu prices.


## Forecast demo v3: varied baskets, unchanged demand

V3 preserves v2's ten-order daily average and every variant/day sales quantity.
Only synthetic basket grouping changes: a quarter retain their old preferences;
the rest include solo purchases and varied companions. The 37 actual receipt
samples bypass regrouping. Order cash/payment splits may change, but daily variant
revenue and recipe consumption remain identical. The regression compares all 643
days from January 2025 through October 5, 2026. These remain synthetic demo scores.

V2 cannot extend with v3. Stop backend and ML, then run from server:

```bash
npm run db:migrate:deploy
npm run db:generate
npm run seed:demo:forecast -- --through=2026-10-05 --apply --confirm=RESET_SMARTCAFE
```

This explicitly replaces demo data. Restart and regenerate forecasting, MBA,
reorder and waste advice. Extend the same v3 profile through the completed day
before your defense; exclude the in-progress day. Preview without --apply never
accesses the database. Keep the configured demo admin credentials.
