-- Count restoration may span many batches; preserve the complete allocation history.
ALTER TABLE "stock_adjustments" ALTER COLUMN "notes" TYPE TEXT;
