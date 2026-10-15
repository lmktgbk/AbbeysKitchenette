# Waste Insights

The backend identifies actionable concerns from dated recipe demand and current
batch balances. Expiry is inclusive through the Manila business date. Allocation
is priority-first FIFO; expired batches cannot be consumed by orders.

Four independent concern types can coexist for an ingredient:

- `expired_stock`: actual remaining expired stock, with recorded ingredient cost.
- `expiry_risk`: estimated unused quantity at expiry from the FIFO simulation.
- `expiry_watch`: expiring within seven days, with unknown unused quantity when
  available predictions do not cover every date from today through batch expiry.
- `excess_stock`: usable stock above 150% of seven-day demand. The excess estimate
  retains the existing 120% demand target. It is not confirmed waste or savings.

Expired and predicted quantities/costs are never combined. Healthy stock produces
no cards. Cost exposure is null when unknown; potential savings is always null.

Waste calculations use available variant predictions multiplied by recipe quantities.
Missing/skipped variants contribute no predicted use and do not block other variants;
this is not a claim that actual demand for those variants is zero. Forecast age alone
does not invalidate predictions. Only upcoming dated predictions are used. Explicit
zero predictions count as covered dates; absent dates do not. Expiry estimates require
coverage through each batch's expiry independently; excess requires all seven dates.
The UI reports covered dates, missing coverage and the available-predictions basis.
Reorder Suggestions retains its separate completeness/freshness policy.

Gemini recommends prevention actions only for non-expired flagged concerns, in
sequential groups of up to 20. A simple JSON contract and strict key validation
prevent model output from changing stored quantities, risk, dates or cost. Gemini
is asked to personalize recommendations with supplied ingredient/batch facts and
may quote verified quantities, without inventing purchase quantities or savings. Each request
allows 15 seconds and at most two attempts for transient failures, within a
60-second overall AI deadline. Failures retain standard factual guidance for the
remaining concerns. Cancellation of an external automation prevents publication.
Expired disposal guidance needs no model call. No external call holds stock locks.

All generated evidence is stored in metadata with policy version 3 and a stable
fingerprint. Reads hide resolved concerns and mark changed facts stale. Old policy
rows require regeneration for actions. No migration or reseed is needed.

Admin-only actions:

- `POST /:id/batches/:batchId/prioritize`: invokes inventory priority handling;
  confirms membership, current evidence, positive stock and non-expiry under the
  ingredient lock. Clear/set is atomic and audited. Orders fall back to usable
  FIFO batches when a prioritized batch is empty or expired.
- `POST /:id/batches/:batchId/expired-loss`: invokes existing whole-batch expired
  loss handling after the loss dialog and confirmation. Evidence and expiry are
  checked inside the stock transaction. Batch versions prevent duplicate loss;
  loss, adjustment and audit commit together. Other batches are not deducted.
- `POST /:id/accept` and `/reject`: review status only; never mutate inventory.

The UI uses the compact Reorder Suggestions card layout, with batch IDs and expiry
dates under Details. Acknowledge opens the expired-loss draft for expired stock,
or priority confirmation for an eligible expiring batch. Multiple eligible batches
open a batch chooser first. Without a batch action it records acknowledgment only.
Canceling a draft or confirmation leaves review status and inventory unchanged.
Confirmed priority and expired-loss actions mark their insight accepted inside the
same inventory transaction. Failure rolls back both stock and acknowledgment.
The handled card disappears; other concerns remain independent. For a multi-batch
card, the selected action handles that recommendation; remaining batches can be
reviewed in inventory or a newly generated run.
Stale insights require regeneration before acknowledgment/actions.
Only explicit confirmed batch actions change
inventory. If a batch changes while its dialog is open, refresh/regenerate rather
than applying an old quantity. Accepted/dismissed history is retained; generation
replaces only pending insights. An expired loss does not automatically acknowledge
other concerns for that ingredient. Stock mutations and inventory WebSocket events
refresh both separately keyed advice panels. Successful accepts remove their cached
card immediately and reconcile with the server; failures do not hide a card.
