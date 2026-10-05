import { randomUUID } from "node:crypto";
import prisma from "../../config/prisma.js";
import { env } from "../../config/env.js";

/** Persist provider asset ownership and cleanup leases; scope all identities to the configured cloud. */
export function createStorageRepository(database = prisma, cloudName = env.CLOUDINARY_CLOUD_NAME) {
  return {
    /** Track the chosen provider ID before upload so process failure cannot leave an untracked asset. */
    async reserve(publicId, uploaderId) {
      const [row] = await database.$queryRaw`INSERT INTO storage_assets (cloud_name, public_id, uploader_id, next_attempt_at)
        VALUES (${cloudName}, ${publicId}, ${uploaderId ?? null}::uuid, clock_timestamp() + interval '1 day') RETURNING asset_id`;
      return row.asset_id;
    },
    /** Record confirmed provider success; uncertain uploads must not be treated as safely deletable. */
    async ready(publicId, imageUrl) {
      const count = await database.$executeRaw`UPDATE storage_assets SET image_url = ${imageUrl}, state = 'ready',
        next_attempt_at = clock_timestamp() + interval '1 day', last_error = NULL, updated_at = clock_timestamp()
        WHERE cloud_name = ${cloudName} AND public_id = ${publicId} AND state IN ('uploading','blocked')`;
      if (!count) throw Error("Upload lifecycle is no longer available");
    },
    /** Shorten quarantine for a confirmed upload rejected by the request workflow. */
    async schedule(publicId) {
      // Definitive local rejection can shorten quarantine only once upload success is known.
      await database.$executeRaw`UPDATE storage_assets SET next_attempt_at = LEAST(next_attempt_at, clock_timestamp() + interval '1 hour')
        WHERE cloud_name = ${cloudName} AND public_id = ${publicId} AND state = 'ready'`;
    },
    /** Lock one due asset, recheck live references, and lease deletion only for unreferenced known uploads. */
    async claim() {
      return database.$transaction(async tx => {
        const [row] = await tx.$queryRaw`SELECT * FROM storage_assets WHERE cloud_name = ${cloudName}
          AND state IN ('uploading','ready','deleting') AND next_attempt_at <= clock_timestamp()
          AND (owner IS NULL OR lease_expires_at <= clock_timestamp())
          ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (!row) return null;
        // Unknown provider outcomes require review; elapsed time alone does not prove a safe deletion.
        if (row.state === 'uploading') {
          await tx.$executeRaw`UPDATE storage_assets SET state = 'blocked', last_error = 'UPLOAD_OUTCOME_UNKNOWN',
            next_attempt_at = NULL, updated_at = clock_timestamp() WHERE asset_id = ${row.asset_id}::uuid`;
          return { blocked: true };
        }
        const [references] = await tx.$queryRaw`SELECT EXISTS (
          SELECT 1 FROM products WHERE storage_identity(image_url) = ARRAY[${row.cloud_name}, ${row.public_id}]::text[]
          UNION ALL SELECT 1 FROM "User" WHERE storage_identity(image_url) = ARRAY[${row.cloud_name}, ${row.public_id}]::text[]
        ) AS used`;
        if (references.used) {
          await tx.$executeRaw`UPDATE storage_assets SET state = 'attached', owner = NULL, lease_expires_at = NULL,
            next_attempt_at = NULL, updated_at = clock_timestamp() WHERE asset_id = ${row.asset_id}::uuid`;
          return { retained: true };
        }
        // A new owner token fences results from a previous worker whose lease expired.
        const owner = randomUUID();
        await tx.$executeRaw`UPDATE storage_assets SET state = 'deleting', owner = ${owner}::uuid,
          lease_expires_at = clock_timestamp() + interval '2 minutes', attempts = LEAST(attempts + 1, 1000000),
          updated_at = clock_timestamp() WHERE asset_id = ${row.asset_id}::uuid`;
        return { ...row, owner };
      }, { maxWait: 2500, timeout: 5000 });
    },
    /** Accept only the current unexpired owner's result; failed deletion is rescheduled with capped backoff. */
    async finish(asset, success) {
      return database.$executeRaw`UPDATE storage_assets SET state = CASE WHEN ${success} THEN 'deleted' ELSE 'deleting' END,
        owner = NULL, lease_expires_at = NULL, next_attempt_at = CASE WHEN ${success} THEN NULL
          ELSE clock_timestamp() + LEAST(3600, 60 * power(2, LEAST(attempts, 6))) * interval '1 second' END,
        last_error = CASE WHEN ${success} THEN NULL ELSE 'PROVIDER_DELETE_FAILED' END, updated_at = clock_timestamp()
        WHERE asset_id = ${asset.asset_id}::uuid AND owner = ${asset.owner}::uuid AND state = 'deleting'
          AND lease_expires_at > clock_timestamp()`;
    },
  };
}
export const storageRepository = createStorageRepository();
