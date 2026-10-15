# Inventory advice module

Routes authorize admins; controllers handle HTTP envelopes. Reorder generation
sends verified ingredient facts to Gemini, which chooses purchase quantity,
urgency and a short reason for ingredients needing purchasing review.
Repositories publish complete, validated advice atomically, retaining history.
Before calling Gemini, exclude healthy ingredients: candidates must be below
minimum/out of usable stock, short against known forecast demand, exposed to an
expiry-related shortage, or short against recent consumption when forecasts are
incomplete. Soon-expiring stock alone is not a reason to reorder if other stock
covers demand and minimum. Gemini can still choose zero; such responses are
validated but excluded from the reorder list. Existing zero-purchase and now-
healthy advice is hidden on reads and cannot be accepted. No candidates means
zero provider calls and successful replacement of the pending list with no rows.

Shared pure policy: src/services/inventoryPlanning.js. Shared set-based database
snapshot: inventoryPlanning.repository.js (short repeatable-read transaction).
Batch consumption follows priority-first FIFO; expiry dates remain usable through
the Manila expiry day. Expired quantities stay recorded until confirmed disposal.

Reorder context covers seven upcoming dates and all linked variant recipes.
Missing dates and skipped variants are explicitly disclosed; partial demand is
not complete coverage. The Forecasting ingredient table uses the same snapshot
and expiry-aware stock, but displays needs and estimated coverage from the
variants actually predicted in the selected run. Skipped variants do not block
its rows; ingredients with no predicted variant are omitted. Reorder context
still discloses missing demand. Both exclude expired batches.
Current reorder forecasts need upcoming-date coverage; no arbitrary
48-hour cutoff is applied to reorder advice. Waste insight freshness stays at
48 hours. Recorded negative order deductions provide supporting consumption
averaged over 14 complete Manila days. Zero recorded use does not prove no demand.

There is no mandatory reorder buffer or supplier lead time. Gemini is instructed
to explain allowances and consider staged purchasing for perishables. Pack sizes,
delivery time, new-stock shelf life, budgets and storage limits are unknown.
Expired stock stays recorded until confirmed disposal. Unknown batch expiry is
disclosed rather than invented; expiry-day stock remains usable through that day.

Strict output validation requires every supplied ingredient once, exact stored
units, finite nonnegative quantities fitting Decimal(10,3), whole pieces and a
reason. Backend warnings flag potential shortages, stock below minimum and
quantities exceeding 150% of demand/minimum; these never silently change the AI
quantity. Stored confidence is a data-quality indicator, not calibrated accuracy.

Waste separates expired stock, estimated residual at expiry, unknown expiry
watches and excess stock. Cost at risk is an estimate, not guaranteed savings.
The sidebar Accept button only opens an unsaved Restock draft. Canceling leaves
the recommendation pending. Saving submits optional `reorder_suggestion_id` with
the delivery; the backend validates matching ingredient, pending status and current
evidence under the stock lock, then accepts the advice and records delivery in one
transaction. Either both commit or neither does. Duplicate or stale linked saves
are rejected before adding stock. Standalone accept remains an intent-only API;
the sidebar no longer invokes it. Dismiss does not move inventory. Confirmed waste
disposal reuses batch loss, stock locks and version checks.

Reorder facts/fingerprints are persisted with generated advice. Changes to the
business date, stock balances/priorities/expiry, recipes, forecast, minimum stock
or recent consumption mark it stale. Acceptance rechecks under the ingredient
lock and rolls back stale intent. Old policy-1 suggestions require regeneration.

Gemini calls use sequential chunks of 20 ingredients (one request group at a
time), a 180-second overall deadline and bounded response sizes. The browser
waits up to 210 seconds and uses the existing generate-button spinner. Each
provider attempt allows 45 seconds, bounded by the overall deadline. Scheduled
runs keep their existing 240-second outer deadline. Structured JSON output
constrains basic fields before local validation. IDs, exact counts, units,
precision and limits remain strict backend checks rather than complex provider
grammar constraints. Safe 400 diagnostics include a request-issue category and
allowlisted parameter paths, never raw provider descriptions. Transient provider errors get
at most three attempts per chunk, with exponential backoff and jitter inside
the same overall deadline; SDK retries are disabled to avoid multiplying retries.
Credentials, missing-model, rate/quota, timeout, busy-service, truncated-output
and validation errors have distinct diagnostics. Logs contain only phase, model,
status, attempt/count, elapsed time and validation field paths, never prompts, raw model text,
credentials or provider error messages. Any failed/invalid chunk
preserves previous recommendations. No provider call holds database locks.
Waste uses backend-calculated quantities with Gemini prevention recommendations;
see ../wasteReduction/README.md. Waste calculations are not delegated to Gemini.
