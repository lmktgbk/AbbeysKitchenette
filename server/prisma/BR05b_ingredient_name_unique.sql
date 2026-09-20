-- BR-05b: case-insensitive ingredient-name uniqueness.
-- Aborts with a conflict report if case-duplicates already exist —
-- resolve those manually first (never auto-merge transactional data).
DO $$
DECLARE
  conflicts TEXT;
BEGIN
  SELECT string_agg(
    format('%s (%s)', name, ids), '; '
  ) INTO conflicts
  FROM (
    SELECT LOWER(ingredient_name) AS name,
           string_agg(ingredient_id::text, ', ') AS ids
    FROM ingredients
    GROUP BY LOWER(ingredient_name)
    HAVING COUNT(*) > 1
  ) dupes;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Case-duplicate ingredient names exist: %. Resolve manually before applying.', conflicts;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ingredients_name_lower_uniq
  ON ingredients (LOWER(ingredient_name));
