# Price optimization

This module gathers product, cost, sales, forecast and public-menu evidence for
Gemini. It publishes advisory suggestions; only an admin can apply or dismiss.

## Responsibilities

- `repository`: parameterized SQL context, publication and atomic price writes.
- `service`: context orchestration and transactional suggestion resolution.
- `prompts`: cafe/product-aware Gemini guidance and bounded provider requests.
- `output`: strict provider output, authoritative calculations and price guards.
- `market`: bounded HTTPS retrieval, evidence checks, median and persistent cache.
- `sources`: reviewed public Lipa entry points; API users cannot submit fetch URLs.
- `controller`, `routes`, `validation`: HTTP response, authorization and input boundary.

## Conditions

Ingredient costs use quantity-weighted historical restock costs in both the
summary and recipe breakdown. Every variant requires a recipe and recorded costs.
Missing values do not become zero. Explicit zero costs remain valid. This is an
ingredient margin estimate, not net profit or the inventory FIFO valuation.

Recommendations must cover every variant, remain within ±10% of observed price,
and never fall below ingredient cost. When the cost floor cannot fit the band,
manual pricing review is required. Approval rechecks price, recipe completeness,
cost and the band in the update statement. Price/status/audit changes commit
together; failures roll back the pending claim. Legacy policy-1 rows remain
readable and dismissible but cannot be applied. Regeneration replaces pending
rows only after validation; failed provider calls preserve prior suggestions.

Demand uses completed sales over 30 Manila calendar days and the latest completed,
non-skipped forecast. Forecast context requires completion within seven days,
an unexpired job period and remaining daily dates. Missing forecasts are unknown.
No price elasticity, revenue uplift or guaranteed competitiveness is claimed.

## Public menu collection

Collection uses the fixed source list, public IPv4 DNS pinning, HTTPS, no redirects,
bounded response size, timeouts, and no cookies/credentials. Image/iframe menus
are skipped. Gemini extracts exact source quotes; the backend checks quote,
item, portion, amount, variant identity and promotion exclusion. Semantic
comparability is AI-assisted and is not independently guaranteed by quote checks.

Only equivalent explicitly stated portions qualify. At least three distinct
competitors are required for a median/range. Sources are all labelled online-menu;
they are not asserted to be dine-in menus. Delivery listings/promotions must not
be added to this group. No hardcoded or model-invented competitor average is used.
Collection time is not the publisher's menu update date. Evidence older than
30 days is excluded. A seven-day database cache refreshes on the next Generate,
not on every read or with a separate scheduled worker. Editing product context,
variant identities/sizes or the source list invalidates that cache signature.

Initial retrieval verified Cafe 1740 price text. Prism uses an embedded menu;
Cafe de Lipa did not expose usable menu prices to the collector. Therefore the
starting list does not establish three usable comparable competitors. Local
market data may remain unavailable; cost/demand suggestions still work. This is
not automatic competitor discovery, paid search grounding or a scraper bypass.

## Local startup

From `server/` run `npm.cmd run db:migrate:deploy`, then
`npm.cmd run db:generate`, and restart `npm.cmd run dev`. This applies the additive
pricing-evidence migration without resetting product data. No new API key or
paid Gemini grounding is required. Start the client as usual.

Open a product's Price Optimization and regenerate. The first run can take longer
than cached runs due to menu retrieval and AI extraction. The pricing AI call has
a 30-second deadline, extraction 20 seconds, menu DNS 3 seconds and HTTPS 8 seconds;
the browser request is bounded to 90 seconds. Verify displayed evidence or the
insufficient-data message, ingredient margins, legacy regeneration and explicit
application. No public database migration or live Gemini run is performed by the
automated regression suite.
