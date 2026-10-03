import { createHash, randomUUID } from "node:crypto";
import prisma from "../../config/prisma.js";
import { env } from "../../config/env.js";

export const SHEETS_GAP_MS = 2200;
const leaseKey = () => `sheets:${createHash("sha256").update(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").digest("hex")}`;

/** Database-clock leases serialize replicas without keeping a transaction open during Google calls. */
export const sheetsRepository = {
  async claim() {
    const owner = randomUUID(), key = leaseKey();
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO background_leases (key) VALUES (${key}) ON CONFLICT (key) DO NOTHING`;
      const gate = await tx.$queryRaw`UPDATE background_leases SET owner = ${owner}::uuid,
        expires_at = clock_timestamp() + interval '90 seconds'
        WHERE key = ${key} AND (expires_at IS NULL OR expires_at <= clock_timestamp())
          AND next_run_at <= clock_timestamp() RETURNING key`;
      if (!gate.length) return null;
      const events = await tx.$queryRaw`WITH candidate AS (
        SELECT id FROM sheet_sync_log WHERE payload IS NOT NULL AND spreadsheet_id IS NOT NULL
          AND next_attempt_at <= clock_timestamp()
          AND (status = 'pending' OR (status = 'processing' AND lease_expires_at <= clock_timestamp()))
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE sheet_sync_log AS event SET status = 'processing', lease_owner = ${owner}::uuid,
        lease_expires_at = clock_timestamp() + interval '90 seconds', attempts = attempts + 1,
        updated_at = clock_timestamp() FROM candidate WHERE event.id = candidate.id
        RETURNING event.id, event.event_id AS "eventId", event.payload, event.spreadsheet_id AS "spreadsheetId",
          event.sheet_row AS "sheetRow", event.attempts`;
      if (!events.length) {
        await tx.$executeRaw`UPDATE background_leases SET owner = NULL, expires_at = NULL WHERE key = ${key} AND owner = ${owner}::uuid`;
        return null;
      }
      return { ...events[0], owner, key };
    }, { timeout: 5000 });
  },
  async destination(spreadsheetId) {
    return prisma.sheetSyncDestination.findUnique({ where: { spreadsheetId } });
  },
  async initialize(spreadsheetId, nextRow) {
    await prisma.sheetSyncDestination.createMany({ data: { spreadsheetId, nextRow }, skipDuplicates: true });
  },
  async reserve(event) {
    return prisma.$transaction(async tx => {
      const owned = await tx.$queryRaw`SELECT sheet_row FROM sheet_sync_log WHERE id = ${event.id}
        AND lease_owner = ${event.owner}::uuid AND status = 'processing'
        AND lease_expires_at > clock_timestamp() FOR UPDATE`;
      if (!owned.length) throw new Error("SHEETS_LEASE_LOST");
      if (owned[0].sheet_row !== null) return owned[0].sheet_row;
      const rows = await tx.$queryRaw`UPDATE sheet_sync_destinations SET next_row = next_row + 1
        WHERE spreadsheet_id = ${event.spreadsheetId} RETURNING next_row - 1 AS row`;
      if (!rows.length) throw new Error("SHEETS_DESTINATION_MISSING");
      await tx.sheetSyncLog.update({ where: { id: event.id }, data: { sheetRow: rows[0].row } });
      return rows[0].row;
    }, { timeout: 5000 });
  },
  async owns(event) {
    const rows = await prisma.$queryRaw`SELECT id FROM sheet_sync_log WHERE id = ${event.id}
      AND lease_owner = ${event.owner}::uuid AND lease_expires_at > clock_timestamp() AND status = 'processing'`;
    return rows.length === 1;
  },
  async finish(event, { status, code = null, delayMs = 0 }) {
    return prisma.$executeRaw`UPDATE sheet_sync_log SET status = ${status}, last_error = ${code},
      synced_at = CASE WHEN ${status} = 'synced' THEN clock_timestamp() ELSE synced_at END,
      next_attempt_at = clock_timestamp() + ${delayMs} * interval '1 millisecond',
      lease_owner = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
      WHERE id = ${event.id} AND lease_owner = ${event.owner}::uuid
        AND lease_expires_at > clock_timestamp() AND status = 'processing'`;
  },
  async release(event, delayMs = SHEETS_GAP_MS) {
    await prisma.$executeRaw`UPDATE background_leases SET owner = NULL, expires_at = NULL,
      next_run_at = clock_timestamp() + ${Math.max(SHEETS_GAP_MS, delayMs)} * interval '1 millisecond'
      WHERE key = ${event.key} AND owner = ${event.owner}::uuid`;
  },
};
