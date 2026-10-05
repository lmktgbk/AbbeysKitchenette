# Price optimization

The service sends product, recipe, sales and fresh forecast context to Gemini in
one bounded request. Gemini also estimates a Lipa SME market range from learned
knowledge. This is unverified guidance, not current internet research or quoted
competitor prices. No website collector or menu cache remains in active code.

## Responsibilities

- Repository: scoped parameterized SQL and atomic publication/price updates.
- Service: context orchestration, input snapshots and transaction resolution.
- Prompts: cafe/product guidance, estimate instructions and provider timeout.
- Output: strict response contract, ingredient floor and financial calculations.
- Controller/routes/validation: HTTP handling and admin authorization.

## Context and conditions

Inputs include name, description, category/subcategory, variant size/preparation
label and current price. Ingredient costs use recipe quantities and weighted
historical restock unit costs consistently. Missing recipe/cost records block
generation; explicit zero costs remain valid. Ingredient margin excludes labor,
packaging, rent, utilities and unrecorded operating costs.

Demand uses completed-order sales over 30 Manila calendar days, excluding removed
items. Forecasts must be completed, non-skipped, generated within seven days,
within their job period and contain remaining dates. Missing/stale forecasts
mean unavailable, not stable. Low sales alone do not establish excessive prices.

There is no percentage-change cap. Recommendations must cover every variant,
remain at or above ingredient cost, and fit positive finite two-decimal database
prices. An AI market estimate is either null or an ordered positive low/high
range. It is not a price restriction. Invented competitor names and source claims
are not part of the contract. Model confidence is not calibrated profit probability.

Market estimates are stored with generation date and verified:false, alongside
product, cost, sales and forecast snapshots. Regeneration creates a new analysis;
existing context is not silently refreshed. Generation does not change prices.

Admin approval rechecks observed price, recipe completeness and current cost.
Price, status and audit commit together; stale/duplicate/failing actions roll back.
Policy-3 suggestions use this contract. Earlier rows remain readable/dismissible
but must be regenerated before application. Provider failures preserve old rows.

## Retired code and migration

The collector, fixed sources, three-competitor requirement, DNS/HTTPS scraping,
menu cache and unused competitor-average column have been removed. Applied
migration history is retained. A new migration drops only obsolete cache data
and the unused column; product and recommendation history remain.

## Local run

From server/:

```bash
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
npm.cmd run dev
```

Restart the client and regenerate suggestions. Verify the labelled AI-estimated
range or unavailable message, larger price changes and cost-floor enforcement.
No new key or paid search is required. Gemini has a 30-second deadline; browser
waiting is limited to 45 seconds. Live estimates and interactive behavior remain
unverified by automated tests alone.
