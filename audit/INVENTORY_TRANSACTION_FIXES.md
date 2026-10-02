# Inventory settlement and refund remediation

This batch implements H10 and fixes related stock, loss and refund inconsistencies.
It does not establish overall production readiness. Final manual checks remain in
`audit/FINAL_TESTING_CHECKLIST.md`.

## Original consumption

Every newly paid walk-in, fulfilled guest order and accepted order records each
item's actual ingredient consumption against the original FIFO stock batch and
its captured cost. Recipe inputs are read once before the transaction; the same
inputs determine stock deductions and the stored allocation. Changing a recipe
or batch cost later does not change the history used for restoration or losses.

The order's `consumption_recorded_at` marker commits with those records, even for
recipe-free items. Nullable historical item IDs are deliberately not backfilled
from current recipes. A composite foreign key prevents linking a deduction to
an item in another order. SQL checks enforce non-negative settlement quantities
and, for item-attributed records, `restored + lost = deducted` at settlement.
Quantities are allocated in integer thousandths to match PostgreSQL precision.

## Atomic cancellation and removal

Cancellation and removal acquire the parent order lock before reading current
totals, cumulative refunds and unsettled consumption. A single guarded SQL update
settles the selected deduction slices. Original quantities and costs remain intact;
`quantity_restored`, `quantity_lost`, `reversed_at` and `reversed_by` record the result.
Here `reversed_at` denotes settlement, including declared loss, rather than asserting
that every unit was returned to stock.

Stock restoration, loss records, adjustment audit, item/order changes, totals,
cancellation records and refunds are in the same transaction. Failures roll them
all back. Concurrent requests for the same item/order cannot restore it twice;
subsequent stale actions return a clear conflict or item-not-found error.
These actions are guarded against duplicate writes; they do not yet provide
the response replay contract introduced for payment submissions.

Losses must reference distinct active items and consumed ingredients. Quantities
must fit three decimals and cannot exceed original consumption. Unspecified
ingredients are restored, not simultaneously recorded as loss. An empty loss
selection restores the item. Accepted orders/items have not started preparation
and follow the existing no-loss policy. Served items remain non-removable.

Refund caps exclude cash change and use fresh cumulative refund values under the
order lock. Remaining totals aggregate the stored line discounts: removing a
discounted item cannot apply its discount to the remaining regular items.
The supported whole-bill payment input is allocated to paid lines proportionally
with deterministic cent remainders, so its aggregate and line amounts stay equal
and subsequent removals preserve the original allocation.
Original receipt issuance amounts remain unchanged; refunds are separate records.
Manual GCash/Maya recording remains unchanged; no gateway operation is introduced.

## Historical orders

Older paid orders lack trustworthy item allocation. Item removal and cancellation
with ingredient loss return `409 CONSUMPTION_HISTORY_REQUIRED` without writes.
Whole-order no-loss cancellation can still restore original aggregate deductions
when no item was previously removed. Historical orders with previous removals
also require reconciliation because their aggregate records may include stock
already returned. Do not clear markers or invent allocations to bypass this guard.

An administrator must reconcile such orders using trustworthy original records
and the established inventory adjustment process. An automated historical repair
workflow is not implemented in this batch. The dialogs explain this limitation;
item removal and historical loss cancellation are disabled in the corresponding UI.
Backend enforcement applies regardless of the frontend.

The detail API supplies original item ingredient quantities/costs to loss dialogs.
Cancellation loss selection excludes removed items and initializes during the
selection action, eliminating its prior state-setting effect and lint error.

## Query and reliability limits

- FIFO allocation carries a cursor over exhausted batches instead of rescanning
  them for each item.
- Settlement, batch stock credits, loss records and stock audit use batch writes.
- Active consumption has an `(order_id, order_item_id, reversed_at)` index.
- Removal reuses its remaining-item result instead of counting again inside and
  after commit; its response count belongs to its committed transaction.
- New paid-order detail reads consumption and loss history concurrently, without
  a current-recipe lookup or redundant aggregate-cost query.
- External notifications, Sheets, availability updates and anomaly scans remain
  outside financial transactions. Durable delivery/outbox work remains open.

No throughput/latency improvement is claimed from these structural changes.
Representative large-data and multi-connection contention tests are **Not verified**.
The existing admin force-close/refund attribution policy, historical data repair,
backup/recovery, outbox and other audit findings remain outstanding.

## Verification and deployment

- Additive migration `20261003020000_item_consumption` is applied to configured
  Supabase. All four migrations are current; database-to-Prisma diff is empty.
- Prisma schema validation and client generation pass.
- All migrations and fixtures replay in a disposable PostgreSQL schema, then
  always roll back. Actual repository settlement/stock SQL verifies the composite
  foreign key, quantity checks, duplicate guard, version guard and rollback.
  Run `npm run db:migrate:rehearse` from `server` to repeat this check. It creates
  only disposable objects and does not read or write public application records.
- **409 tests pass in 11 files**, including 38 new regression cases. Tests verify
  original allocation, fractional quantities, changed
  recipes/costs, fresh refund totals, removal/cancellation scheduling, duplicate
  actions, invalid losses, historical guards and injected persistence failures.
  The suite's transaction double serializes transactions; it is not a substitute
  for PostgreSQL multi-connection race testing.
- Changed dialogs pass lint; frontend build passes with the existing large-bundle
  warning. Full-project lint and full browser workflow verification remain open.

Regenerate Prisma on deployment and restart the backend. Deploy the updated
frontend for the reconciliation messages and corrected loss selection. Existing
installations must apply migrations before running the new backend; schema changes
are additive, with historical rows retained and no business-data backfill.
