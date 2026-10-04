# Server cleanup — batch 1

This batch relocates 15 implementations out of the broad `src/services` folder:
durable effects, image storage, ML transport/admission, process operations,
rate-limit maintenance, and feature-owned anomaly triggers. Existing filenames,
exports, transactions, queries, timeouts, and retry behavior are preserved.
Application imports and test imports/mocks follow the new paths; no forwarding
wrappers or duplicate implementations were introduced.

See `server/src/infrastructure/README.md` for responsibilities and the write flow.
The remaining services, realtime implementation, Sheets integration, and provider
configuration are intentionally deferred. This is the first structural batch,
not completion of the full server cleanup.

## Verification

- Before relocation: 826 tests passed; 117 opt-in database tests skipped.
- After relocation: 826 tests passed; the same 117 database tests skipped.
- Existing database regression files were updated to import the relocated code.
- No database schema, migration, HTTP contract, or client/ML implementation changed.
- Live browser/provider workflows and database integration execution for this
  batch: **Not verified**.

Next: review orders and inventory ownership, readability, and transaction comments
without combining structural edits with changes to business behavior.

## Batch 2 — order consumption and inventory locking

- Moved `stockLocks.js` to feature-owned `ingredients/ingredient.lock.js`; both
  order and inventory services use this one implementation.
- Expanded compressed consumption validation and settlement code without changing
  calculations, ordering, error codes, or database writes.
- Documented caller transaction requirements, lock ordering, version checks,
  original-cost settlement, and legacy restoration compatibility.
- Added `modules/orders/README.md` to explain feature responsibilities and flows.
- Retained separate order bulk deduction and inventory single-ingredient FIFO
  paths; their write shapes do not justify a generic shared framework.

Verification: 826 ordinary tests passed (117 opt-in cases skipped). The opt-in
`effects.database.test.js` suite then passed all 17 cases against a disposable
PostgreSQL schema, covering paid orders, replay, rollback, inventory changes, and
concurrent restocks. This does not verify every order race against PostgreSQL or
live browser/provider behavior. No production business data was modified.

This is a focused readability batch. Larger service decomposition, remaining
helper ownership, and broader duplication review remain outstanding.

## Batch 3 — pricing ownership and inventory list duplication

- Extracted unchanged pricing/payment methods from `order.service.js` into
  `order.pricing.js`, alongside monetary calculations. Direct object composition
  preserves existing service methods and test interception without wrappers.
- Replaced the mixed `order.utils.js` with explicit pricing and response owners;
  valid transitions now live with action policy. Removed unused status labels,
  timestamp mapping, next-status helper, and unused discount/payment constants
  after searching callers. Runtime-used item discount constants remain.
- Shared active/archived ingredient-page enrichment inside the existing service,
  preserving two batch queries and intentional absence of archived `status`.
- Kept whole-bill and per-line discount handling distinct: their input behavior
  differs, so consolidation would require an intentional behavior change.

Verification: 826 existing ordinary cases passed; two new ingredient list-contract
cases passed separately; 17 disposable PostgreSQL effects/order/inventory cases
passed. Extracted pricing method text matches the previous implementation exactly.
No schema, transaction boundary, stock query, or public HTTP contract was changed.
Live browser/provider checks and all order race scenarios against PostgreSQL remain
**Not verified** for this batch.

The services still contain substantial business workflows. This batch establishes
pricing and formatting boundaries; it does not claim all large functions or
cross-feature dependencies are resolved. Continue reviewing transaction workflows
before deciding whether further extraction improves clarity.
