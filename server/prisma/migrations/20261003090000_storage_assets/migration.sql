CREATE TABLE storage_assets (
  asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloud_name VARCHAR(100) NOT NULL CHECK (cloud_name ~ '^[A-Za-z0-9_-]+$'),
  public_id VARCHAR(160) NOT NULL CHECK (public_id ~ '^abbseys-kitchenette/(products|avatars)/[A-Za-z0-9_-]+$'),
  image_url TEXT,
  uploader_id UUID,
  state VARCHAR(20) NOT NULL DEFAULT 'uploading' CHECK (state IN ('uploading','ready','attached','deleting','deleted','blocked')),
  owner UUID,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ,
  last_error VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (cloud_name, public_id)
);
CREATE INDEX storage_assets_due_idx ON storage_assets (cloud_name, state, next_attempt_at);
ALTER TABLE storage_assets ENABLE ROW LEVEL SECURITY;

-- Normalize versioned URLs to one identity; transformed/foreign URLs remain outside cleanup.
CREATE FUNCTION storage_identity(value TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE
SET search_path = "public", pg_temp AS $$
  SELECT regexp_match(value, '^https://res\.cloudinary\.com/([A-Za-z0-9_-]+)/image/upload/(?:v[0-9]+/)?(abbseys-kitchenette/(?:products|avatars)/[A-Za-z0-9_-]+)\.(?:jpg|jpeg|png|gif|webp)$');
$$;
CREATE INDEX products_storage_identity_idx ON products (storage_identity(image_url));
CREATE INDEX users_storage_identity_idx ON "User" (storage_identity(image_url));

INSERT INTO storage_assets (cloud_name, public_id, image_url, state)
SELECT identity[1], identity[2], min(image_url), 'attached' FROM (
  SELECT image_url, storage_identity(image_url) AS identity FROM products
  UNION ALL SELECT image_url, storage_identity(image_url) FROM "User"
) images WHERE identity IS NOT NULL GROUP BY identity[1], identity[2]
ON CONFLICT DO NOTHING;

CREATE FUNCTION storage_reference_guard() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = "public", pg_temp AS $$
DECLARE identity TEXT[]; asset storage_assets%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN RETURN NEW; END IF;
  identity := storage_identity(NEW.image_url);
  IF identity IS NOT NULL THEN
    SELECT * INTO asset FROM storage_assets WHERE cloud_name = identity[1] AND public_id = identity[2] FOR UPDATE;
    IF FOUND THEN
      IF asset.state NOT IN ('ready','attached') THEN
        RAISE EXCEPTION 'IMAGE_NOT_AVAILABLE' USING ERRCODE = '23514';
      END IF;
      UPDATE storage_assets SET state = 'attached', image_url = NEW.image_url, next_attempt_at = NULL,
        owner = NULL, lease_expires_at = NULL, updated_at = clock_timestamp() WHERE asset_id = asset.asset_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION storage_reference_removed() RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = "public", pg_temp AS $$
DECLARE identity TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.image_url IS NOT DISTINCT FROM OLD.image_url THEN RETURN NEW; END IF;
  identity := storage_identity(OLD.image_url);
  IF identity IS NOT NULL THEN
    UPDATE storage_assets SET state = 'ready', next_attempt_at = clock_timestamp(),
      updated_at = clock_timestamp() WHERE cloud_name = identity[1] AND public_id = identity[2] AND state = 'attached';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER products_storage_guard BEFORE INSERT OR UPDATE OF image_url ON products FOR EACH ROW EXECUTE FUNCTION storage_reference_guard();
CREATE TRIGGER users_storage_guard BEFORE INSERT OR UPDATE OF image_url ON "User" FOR EACH ROW EXECUTE FUNCTION storage_reference_guard();
CREATE TRIGGER products_storage_removed AFTER DELETE OR UPDATE OF image_url ON products FOR EACH ROW EXECUTE FUNCTION storage_reference_removed();
CREATE TRIGGER users_storage_removed AFTER DELETE OR UPDATE OF image_url ON "User" FOR EACH ROW EXECUTE FUNCTION storage_reference_removed();
