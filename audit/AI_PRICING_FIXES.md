# AI pricing validation — M13

Implemented 2026-10-04. Recommendations remain advisory; only an authorized admin approval changes sale prices.

## Changed behavior

- Gemini returns only integer variant ID, recommended price, confidence and reasoning. Strict schema validation rejects extra fields, foreign IDs, duplicate IDs, empty or excessive batches, numeric strings, nonfinite values, nonpositive prices, amounts beyond Decimal(10,2), excess decimal places, confidence outside 0–1 and empty/overlong reasoning.
- Product/size names and current prices come from the requested product's database snapshot. The server derives price differences, percentages, direction and margins. Generation responses retain the existing snake_case API contract.
- Missing products return 404; archived products and invalid variant counts return 409 before contacting AI. Independent context reads run concurrently; external AI work runs outside database transactions.
- Provider requests have a 30-second client cancellation deadline and 8192 output-token budget; response text is limited to 100000 characters. Invalid JSON and provider failures return sanitized 502 errors; cancellation/timeout errors return 504. Cancellation does not establish that provider processing or billing stopped. No automatic paid retry is added.
- Publication locks the product, replaces pending rows, then locks and rechecks variant ownership, names and current prices. Any mismatch or insert failure rolls back replacement. Accepted/rejected history remains intact. Suggestion rows are claimed before variant locks to match approval's lock order. The transaction retains its five-second budget.
- Sales context sums item quantities rather than counting order-item rows.

## Verification

- `npm.cmd test`: **781 passed, 49 optional database tests skipped**.
- Pricing boundary, provider and approval regressions: **63 passed**, all AI calls mocked.
- `$env:PRICE_DB_CHECK='1'; npm.cmd test -- tests/price.database.test.js`: **6 passed** against a generated disposable Supabase PostgreSQL schema. All 11 migrations replayed; schema removed after testing. Tests cover actual context SQL, authoritative publication, stale price/foreign variant rejection, concurrent replacement, real insertion rollback and approval/publication concurrency. Application tables were not modified.
- No schema changes; no migration or client generation required.

## Limits and final acceptance

Live Gemini behavior, recommendation business quality, provider timeout behavior and representative load remain **Not verified**. Existing saved recommendations are not retroactively proven trustworthy; review or regenerate pending recommendations before applying them. Static milk-tea market averages remain reference heuristics, not a verified competitor feed; review their suitability for non-drink products. A recipe/cost change during AI processing does not have a version fence; margins describe the captured costing snapshot. The existing approval predicate still rejects stale sale prices.

All live acceptance cases are in FINAL_TESTING_CHECKLIST.md. This batch addresses the M13 validation boundary, not market-pricing policy or general durable audit delivery (M14).
