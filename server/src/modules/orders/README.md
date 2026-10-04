# Orders and inventory boundaries

Routes validate and authorize HTTP actions. Controllers translate requests and
responses. `order.service.js` coordinates the business transaction;
`order.repository.js` executes its queries using the supplied transaction.

| File | Responsibility |
| --- | --- |
| `order.policy.js` | Action permission checks and valid status transitions. |
| `order.idempotency.js` | Request fingerprint and duplicate-submission claims. |
| `order.consumption.js` | Pure allocation and settlement of saved item consumption. |
| `order.pricing.js` | Authoritative pricing, discount allocation, identity fields, and manual payment checks. |
| `order.response.js` | Public response formatting and order-number presentation. |

## Payment and stock flow

Walk-in creation prices items and reads recipes before opening the write
transaction. Inside the transaction it claims idempotency, resolves the shift,
creates the order, reserves stock, and records receipt and durable follow-up work.
Acceptance of a pending order similarly reserves stock when payment is recorded.
GCash and Maya are manual payment records; these flows do not contact a gateway.

The service includes `orderPricing` methods directly, preserving existing service
entry points without forwarding wrappers. Pricing reads settings and variant
prices but does not write stock, create orders, or open a business transaction.
Whole-bill and per-line discount calculations retain their distinct input handling;
their lower-bound behavior differs, so they must not be merged without a separate
behavior change and validation review.

Stock reservation locks ingredient rows through
`ingredients/ingredient.lock.js`, reads available batches in repository order,
and applies a version-guarded bulk deduction. `allocateConsumption` attributes
those batch slices to paid items in thousandths. The history marker commits with
the slices, including orders without ingredient recipes.

Preparation uses a conditional status update. Completion, item preparation
changes, cancellation, and item removal synchronize on the order row where needed.
Do not replace guarded writes with unqualified status updates or trust an earlier
read to authorize a write.

Cancellation and removal settle original consumption and refund records within
the same transaction. Restored quantity and declared loss together account for
the original deduction. Saved batch costs determine losses; current recipes and
supplier prices must not rewrite paid-order history. Legacy order-level restoration
is a deliberate compatibility path, not a second implementation to delete blindly.

`computeRefundAmount` shares the refund cap calculation. Cancellation supplies the
remaining order total as its limit; removal supplies the drop in net total. Both
exclude cash change and subtract cumulative prior refunds. The service still
controls eligibility, holds the order lock, and persists the result. The helper
does not authorize refunds or contact a payment provider.

## Inventory collaboration

Inventory restock, loss, and count operations acquire the same ingredient lock
before their stock snapshot. Order operations acquire applicable order/shift
locks before ingredient locks; ingredient IDs are locked in stable order.

Order bulk deduction and inventory's single-ingredient FIFO adjustment have
different write shapes. Keep their transaction contracts explicit rather than
introducing a generic allocation framework solely because both traverse batches.

No external provider calls should be introduced into these stock transactions.
Required audit/notification intent is saved atomically and delivered afterward.
