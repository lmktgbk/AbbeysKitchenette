# Transactional price approval remediation

This batch implements H09. Applying or dismissing a recommendation now resolves
only a pending suggestion. Approval status and product price changes share one
short transaction; a failure cannot commit an accepted suggestion with an
unchanged price. No schema migration is required.

## Resolution and stale actions

The service reads the suggestion, conditionally claims its pending status, then
updates the variant only when its price still equals the recommendation's original
price and its product is not archived. PostgreSQL rechecks the price predicate
after waiting for a concurrent variant-price writer. A failed predicate rolls back
the suggestion claim and returns `409 STALE_PRICE_SUGGESTION`.

Concurrent apply/apply or apply/dismiss actions for the same suggestion have one
winner. Previously accepted or rejected suggestions return
`409 PRICE_SUGGESTION_CONFLICT`; missing suggestions return 404. Two recommendations
based on the same original price cannot overwrite one another after the first
changes that price. A no-change recommendation can resolve without altering the
numeric price; this is not a guarantee that only one separate no-change
recommendation can be resolved.

Recommended prices must be finite, positive, within `numeric(10,2)` range and fit
two decimals. IDs must fit a positive PostgreSQL integer. Admin-only route gates
remain enforced by backend middleware; cashier and kitchen API calls are denied.
The returned resolution timestamp matches the timestamp written in the transaction.

The normal approval path uses one indexed suggestion read, one guarded claim and
one parameter-bound variant-price update. Resolution transactions have a five-second
timeout and contain no AI, email or external-service calls. SQL checks current price
value, not a historical version: changing away and back to the same price is not
detectable by this mechanism. Representative load and contention latency are
**Not verified**; no measured speed improvement is claimed.

## Generation, frontend and remaining limits

Replacing pending suggestions now deletes and inserts within one transaction.
An insert failure retains prior pending suggestions. Concurrent generation,
AI output scope/structure validation, provider failures and cost/recipe freshness
remain separate audit work; this batch does not establish recommendation quality
or serialize multiple simultaneous generation runs.

Apply and dismiss refetch both product prices and pending suggestions after success
or failure. This handles stale actions and ambiguous lost responses, and fixes the
dismiss path's missing suggestion invalidation. Response replay for resolved price
requests is not implemented; a repeated action returns a conflict and refreshes.
Cross-tab/menu realtime recovery and the broader M18/M19 cache findings remain open.
Audit logging remains outside the transaction; durable audit/event delivery remains
open under M14.

## Evidence and deployment

- **437 tests pass in 12 files**, including 28 new cases covering real Express
  routes/controllers/services/repositories with isolated database operations:
  backend role denials, invalid IDs/prices, missing/resolved suggestions, stale
  prices, archived/deleted targets, write failure rollback, concurrent scheduling,
  duplicate resolution, competing recommendations and failed regeneration.
- Transaction tests use a serialized rollback double. Actual PostgreSQL
  multi-connection approval/dismiss/manual-edit races remain **Not verified**.
- `npm run db:migrate:rehearse` replays all four existing migrations and verifies
  actual repository expected-price SQL, archived-product rejection, decimal-price
  persistence and rollback inside a disposable PostgreSQL schema. All fixtures
  are rolled back; no public application prices or recommendations were changed.
- Updated frontend query code passes lint; frontend build passes. The existing
  bundle-size concern and full-project lint findings remain outstanding.
- Full browser approval, dismissal and lost-response recovery remain **Not verified**.

Restart the backend and refresh/rebuild the frontend to use the changes. There is
no new `db push` or migration deployment step for this batch. Final manual checks
remain consolidated in `audit/FINAL_TESTING_CHECKLIST.md`.
