-- Preserve historical counts while allowing fractional expected demand.
ALTER TABLE "forecast_results" ALTER COLUMN "total_units" TYPE DOUBLE PRECISION USING "total_units"::double precision;
