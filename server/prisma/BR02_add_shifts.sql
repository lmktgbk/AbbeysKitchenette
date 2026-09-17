-- BR-02: Shifts + Order.shiftId (safe, additive — no data loss)
CREATE TABLE IF NOT EXISTS shifts (
  shift_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_label VARCHAR(50) NOT NULL,
  opened_by UUID NOT NULL REFERENCES "User"(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opening_cash DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES "User"(id),
  expected_cash DECIMAL(10,2),
  actual_cash DECIMAL(10,2),
  variance DECIMAL(10,2),
  close_note VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shifts_status_idx ON shifts (status);
CREATE INDEX IF NOT EXISTS shifts_register_label_idx ON shifts (register_label);
CREATE INDEX IF NOT EXISTS shifts_opened_by_idx ON shifts (opened_by);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(shift_id);
CREATE INDEX IF NOT EXISTS orders_shift_id_idx ON orders (shift_id);
