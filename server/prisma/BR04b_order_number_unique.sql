-- BR-04b: order-number uniqueness guard (applied live 2026-09-20).
-- Duplicates become impossible: any counter reset/race now fails loudly
-- instead of silently issuing a duplicate number.
-- Rule: NEVER reset order_counters without wiping the day's orders
-- (cleanup.js deletes both together — the safe path).
ALTER TABLE orders
  ADD CONSTRAINT orders_order_date_number_uniq UNIQUE (order_date, order_number);
