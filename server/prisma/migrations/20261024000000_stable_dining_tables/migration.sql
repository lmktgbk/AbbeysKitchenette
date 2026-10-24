-- Add identity alongside the existing immutable text snapshot. Historical orders stay untouched.
ALTER TABLE "orders" ADD COLUMN "table_id" VARCHAR(40);
ALTER TABLE "orders" ALTER COLUMN "table_number" TYPE VARCHAR(160);

-- Persist legacy row numbers once; later removal must never renumber other tables.
UPDATE system_settings s
SET dining_tables = jsonb_set(s.dining_tables::jsonb, '{tables}',
  COALESCE((SELECT jsonb_agg(entry || jsonb_build_object(
      'id', COALESCE(entry->>'id', 'legacy-' || position::text),
      'number', COALESCE(entry->'number', to_jsonb(position))) ORDER BY position)
    FROM jsonb_array_elements(s.dining_tables::jsonb->'tables') WITH ORDINALITY AS rows(entry, position)), '[]'::jsonb))
WHERE jsonb_typeof(s.dining_tables::jsonb->'tables') = 'array';
