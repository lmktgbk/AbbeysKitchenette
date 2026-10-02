BEGIN;
SET LOCAL lock_timeout = '5s';

-- Existing orders remain explicitly historical: their item allocation cannot
-- be reconstructed safely from recipes that may have changed since payment.
ALTER TABLE public.orders ADD COLUMN consumption_recorded_at TIMESTAMPTZ(6);
ALTER TABLE public.order_ingredient_deductions
  ADD COLUMN order_item_id INTEGER,
  ADD COLUMN quantity_restored DECIMAL(10,3) NOT NULL DEFAULT 0,
  ADD COLUMN quantity_lost DECIMAL(10,3) NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_item_id_key UNIQUE (order_id, order_item_id);
ALTER TABLE public.order_ingredient_deductions ADD CONSTRAINT order_ingredient_deductions_order_id_order_item_id_fkey
  FOREIGN KEY (order_id, order_item_id) REFERENCES public.order_items(order_id, order_item_id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public.order_ingredient_deductions ADD CONSTRAINT deductions_settlement_quantities_check
  CHECK (quantity_restored >= 0 AND quantity_lost >= 0
    AND quantity_restored + quantity_lost <= quantity_deducted
    AND (order_item_id IS NULL OR (quantity_deducted > 0
      AND ((reversed_at IS NULL AND quantity_restored = 0 AND quantity_lost = 0)
        OR (reversed_at IS NOT NULL AND quantity_restored + quantity_lost = quantity_deducted)))));
CREATE INDEX deductions_order_item_active_idx ON public.order_ingredient_deductions(order_id, order_item_id, reversed_at);
COMMIT;
