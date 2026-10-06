# Inventory advice module

Routes authorize admins; controllers handle HTTP envelopes; services calculate
advice and optionally obtain AI explanations; repositories publish pending advice
and audit intent atomically while preserving resolved history.

Shared pure policy: src/services/inventoryPlanning.js. Shared set-based database
snapshot: inventoryPlanning.repository.js (short repeatable-read transaction).
Batch consumption follows priority-first FIFO; expiry dates remain usable through
the Manila expiry day. Expired quantities stay recorded until confirmed disposal.

Policy assumptions: seven upcoming days, two-day lead time, 20% demand buffer,
forecast age at most 48 hours and complete date/variant coverage. Missing, partial
or skipped forecasts use a labelled minimum-stock purchase fallback. Recorded
negative deductions become positive consumption divided by 14 complete business
days. Stored confidence is a data-quality indicator, not calibrated accuracy.

Waste separates expired stock, estimated residual at expiry, unknown expiry
watches and excess stock. Cost at risk is an estimate, not guaranteed savings.
Accept/dismiss does not move inventory; confirmed disposal reuses batch loss,
stock locks and version checks. Recheck current stock before actual purchasing.

Gemini may add labelled explanations but cannot alter quantities or risk. Failure
retains the calculated advice. No external call holds a database transaction.
