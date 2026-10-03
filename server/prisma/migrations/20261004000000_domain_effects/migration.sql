BEGIN;

CREATE TABLE domain_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload JSONB NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'delivered', 'blocked')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  delivered_at TIMESTAMPTZ,
  CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX domain_effects_due_idx ON domain_effects (state, next_attempt_at, created_at);
CREATE INDEX domain_effects_delivered_idx ON domain_effects (delivered_at) WHERE state = 'delivered';
ALTER TABLE domain_effects ENABLE ROW LEVEL SECURITY;

CREATE TABLE availability_repairs (
  variant_id INTEGER PRIMARY KEY REFERENCES product_variants(variant_id) ON DELETE CASCADE,
  revision UUID NOT NULL DEFAULT gen_random_uuid(),
  queued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX availability_repairs_due_idx ON availability_repairs (queued_at);
ALTER TABLE availability_repairs ENABLE ROW LEVEL SECURITY;

-- Repair intent commits with the stock/recipe write, including writers outside HTTP.
CREATE FUNCTION queue_availability_repair(ingredient UUID) RETURNS void LANGUAGE sql
SET search_path = "public", pg_temp AS $$
  INSERT INTO availability_repairs (variant_id)
    SELECT DISTINCT variant_id FROM recipes WHERE ingredient_id = ingredient ORDER BY variant_id
  ON CONFLICT (variant_id) DO UPDATE SET revision = gen_random_uuid(), queued_at = clock_timestamp();
$$;
CREATE FUNCTION stock_availability_dirty() RETURNS trigger LANGUAGE plpgsql
SET search_path = "public", pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM queue_availability_repair(OLD.ingredient_id); END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id) THEN
    PERFORM queue_availability_repair(NEW.ingredient_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER stock_availability_dirty AFTER INSERT OR UPDATE OF quantity_left, ingredient_id OR DELETE
ON restock_batches FOR EACH ROW EXECUTE FUNCTION stock_availability_dirty();
CREATE TRIGGER ingredient_availability_dirty AFTER UPDATE OF is_archived
ON ingredients FOR EACH ROW EXECUTE FUNCTION stock_availability_dirty();

CREATE FUNCTION recipe_availability_dirty() RETURNS trigger LANGUAGE plpgsql
SET search_path = "public", pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    INSERT INTO availability_repairs (variant_id) SELECT variant_id FROM product_variants WHERE variant_id = OLD.variant_id
    ON CONFLICT (variant_id) DO UPDATE SET revision = gen_random_uuid(), queued_at = clock_timestamp();
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO availability_repairs (variant_id) SELECT variant_id FROM product_variants WHERE variant_id = NEW.variant_id
    ON CONFLICT (variant_id) DO UPDATE SET revision = gen_random_uuid(), queued_at = clock_timestamp();
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER recipe_availability_dirty AFTER INSERT OR UPDATE OR DELETE
ON recipes FOR EACH ROW EXECUTE FUNCTION recipe_availability_dirty();

-- Backfill only recipe-backed variants; recipe-free/manual products keep their policy.
INSERT INTO availability_repairs (variant_id) SELECT DISTINCT variant_id FROM recipes;

COMMIT;
