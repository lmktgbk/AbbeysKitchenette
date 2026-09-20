-- BR-04: date-prefixed order numbers (padded YYMMDDNNN, displayed YYMMDD-NNN)
-- Recomputes legacy daily counters from each row's order_date.
-- Only touches short legacy numbers (idempotent: 9-digit rows skipped).
-- Max possible value 991231999 < 2^31, so the Int column is safe.
UPDATE orders
SET order_number = (
  ((EXTRACT(YEAR FROM order_date)::int % 100) * 10000
    + EXTRACT(MONTH FROM order_date)::int * 100
    + EXTRACT(DAY FROM order_date)::int) * 1000
  + order_number
)
WHERE order_number < 1000000;
