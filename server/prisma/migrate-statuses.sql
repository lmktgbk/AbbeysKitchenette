UPDATE "orders" SET status = 'preparing' WHERE status = 'next_in_line' OR status = 'processing';
UPDATE "orders" SET preparing_at = next_in_line_at, preparing_by = next_in_line_by WHERE next_in_line_at IS NOT NULL;
UPDATE "orders" SET preparing_at = processing_at WHERE preparing_at IS NULL AND processing_at IS NOT NULL;
UPDATE "orders" SET preparing_by = processing_by WHERE preparing_by IS NULL AND processing_by IS NOT NULL;
