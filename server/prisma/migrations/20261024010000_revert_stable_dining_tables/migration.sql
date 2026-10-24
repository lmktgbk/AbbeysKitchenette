-- Return to main's existing table-label contract without rewriting applied history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Prevent concurrent writes between the length check and the schema change.
LOCK TABLE orders IN ACCESS EXCLUSIVE MODE;
LOCK TABLE system_settings IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM orders WHERE length(table_number) > 20) THEN
    RAISE EXCEPTION 'Cannot restore table label limit: an existing label exceeds 20 characters';
  END IF;
END $$;

ALTER TABLE orders DROP COLUMN table_id;
ALTER TABLE orders ALTER COLUMN table_number TYPE VARCHAR(20);

-- Keep IDs, names, enabled flags and ordering. Restore default labels that the
-- experimental seed represented as empty names; only the new number key is removed.
UPDATE system_settings s
SET dining_tables = jsonb_set(s.dining_tables::jsonb, '{tables}',
  COALESCE((SELECT jsonb_agg(
    (entry - 'number') || jsonb_build_object('label',
      CASE WHEN btrim(COALESCE(entry->>'label', '')) = ''
        THEN 'Table ' || COALESCE(entry->>'number', position::text)
        ELSE entry->>'label'
      END) ORDER BY position)
    FROM jsonb_array_elements(s.dining_tables::jsonb->'tables')
      WITH ORDINALITY AS rows(entry, position)), '[]'::jsonb))
WHERE jsonb_typeof(s.dining_tables::jsonb->'tables') = 'array';

COMMIT;
