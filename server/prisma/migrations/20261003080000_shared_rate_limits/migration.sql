CREATE TABLE rate_limit_buckets (
  bucket_key CHAR(64) PRIMARY KEY,
  hits INTEGER NOT NULL CHECK (hits >= 0),
  reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX rate_limit_buckets_expiry_idx ON rate_limit_buckets (reset_at);
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
