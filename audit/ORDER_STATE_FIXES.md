# Order authorization and state remediation — 2026-10-03

This batch addresses H03 (item/parent mismatch), H04 (kitchen payment acceptance)
and H05 (unguarded preparation) from the historical audit. It also corrects a
confirmed cancellation defect: reading status after claiming `cancelled` skipped
both accepted/preparing stock-restoration branches.

## Behavior

- The status API and service share one permission rule: acceptance/payment is
  restricted to admin/cashier; kitchen retains preparation and completion.
  The controller supplies the authenticated role, never a body-supplied role.
- Generic status changes cannot invoke cancellation outside its inventory/refund
  workflow. Both preparation endpoints use the same service implementation.
- Preparation conditionally updates only an `accepted` order, saving status,
  preparation timestamp and actor together in one database update. A stale or
  repeated action returns 409 rather than reviving a settled order.
- Item preparation updates require the requested parent order, item ID and
  `removedAt: null`. Mismatches/removed items return 404 without updating them.
- Item toggles, completion, cancellation and removal acquire the parent order's
  row lock before checking dependent items. Completion checks all active items
  while holding that lock; an item cannot subsequently be unchecked on a
  completed order. Removal rechecks preparation/removal state under the lock.
- Cancellation reads current status, financial fields, items and deductions
  inside the locked transaction. Restoration uses the **pre-transition** status,
  with the already-loaded deduction rows reused for full restoration. Failure
  rolls back the status claim and related restoration/refund/cancellation writes.
- Order mutations refresh cached orders/shifts after 403/404/409 responses.
  Existing UI error messages show the server's explanation. Kitchen order cards
  disable item actions while their preparation request is in flight.

All external notifications, availability refreshes and realtime invalidations
continue after successful commits. Manual GCash/Maya recording is unchanged.
No schema changes or database migration are required for this batch.

## Verification and limits

**338 tests pass in 10 files**, including 35 new order cases. The changed frontend
files pass ESLint, and the production frontend build passes.

The order suite uses real Express routing, validation, controllers, services and
repository methods. Authentication is injected into the isolated HTTP fixture;
the existing authentication suite independently verifies actual authentication.
Database writes use a serialized transactional double with rollback snapshots.
External services are mocked; no production data or real notifications are used.

Cases cover all three roles preparing, restricted acceptance, forged role fields,
missing/mismatched/removed items, check/uncheck, stale/repeated preparation,
completion readiness/revalidation, concurrent action schedules, stale removals,
single cancellation/refund, pre-transition restoration, pending cancellation,
refund caps, and rollback. Full-restoration cases exercise the actual restoration
service with synthetic batch quantities and audit adjustments.

Real PostgreSQL contention/isolation, browser interaction, live stock/refund
integration, and production performance are **Not verified** by this suite.
The frontend is checked with ESLint on changed files and a production build.
The existing bundle-size warning remains open.

## Remaining work

This is not a claim that the complete order/payment/inventory workflow is fixed.
Durable submission idempotency (H06), shift-close/sale coordination (H07), atomic
acceptance line-discount persistence (H08), and restoration using immutable
per-item deduction allocations rather than mutable recipes (H10) remain open.
Food/Beverages category restrictions are still frontend presentation rules;
this batch enforces order action roles and item ownership, not a new station
permission model. Address that model explicitly if station assignment is meant
to be a security boundary.

Before deployment, use isolated test orders to verify both operators racing
preparation/cancellation and item-uncheck/completion against PostgreSQL, including
rollback after an injected stock/refund failure. Confirm state, stock, deduction
reversal, cancellation, refund and adjustment records agree before release.
