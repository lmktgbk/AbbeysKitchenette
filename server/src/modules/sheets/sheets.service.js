import { sheetsConfigured, buildSheetRow } from "./sheets.outbox.js";
import { sheetsRepository, SHEETS_GAP_MS } from "./sheets.repository.js";
import { createSheetsTransport, SheetsError } from "./sheets.transport.js";

export function sheetRetryDelay(attempts) {
  return Math.min(300000, 2000 * 2 ** Math.min(attempts - 1, 8)) + Math.floor(Math.random() * 1000);
}

export function createSheetsWorker({ repository = sheetsRepository, transport = createSheetsTransport(), configured = sheetsConfigured } = {}) {
  let running = false, timer, inFlight = null, controller = new AbortController();
  async function deliverNext() {
    if (!configured()) return { ran: false, reason: "not-configured" };
    const event = await repository.claim();
    if (!event) return { ran: false, reason: "idle-or-owned" };
    let cooldown = SHEETS_GAP_MS;
    try {
      if (!await repository.destination(event.spreadsheetId)) {
        const nextRow = await transport.initialize(event.spreadsheetId, controller.signal);
        await repository.initialize(event.spreadsheetId, nextRow);
      }
      event.sheetRow = await repository.reserve(event);
      if (!await repository.owns(event)) throw new SheetsError("SHEETS_LEASE_LOST");
      await transport.deliver(event, controller.signal);
      const finished = await repository.finish(event, { status: "synced" });
      return { ran: true, synced: finished === 1, eventId: event.eventId };
    } catch (error) {
      const code = error instanceof SheetsError ? error.code : "SHEETS_STORAGE_OR_LEASE_FAILURE";
      const blocked = (error instanceof SheetsError && !error.retryable) || event.attempts >= 8;
      cooldown = code === "SHEETS_HTTP_429" ? 60000 : sheetRetryDelay(event.attempts);
      await repository.finish(event, { status: blocked ? "blocked" : "pending", code, delayMs: cooldown });
      console.warn(`[sheets] Delivery ${blocked ? "blocked" : "deferred"}: ${code}`);
      return { ran: true, synced: false, blocked, eventId: event.eventId };
    } finally {
      // A failed acknowledgement leaves a recoverable processing lease and the same reserved row.
      await repository.release(event, cooldown);
    }
  }
  const api = {
    isConfigured: configured,
    buildRow: order => buildSheetRow(order),
    buildAdjustmentRow: (order, kind) => buildSheetRow(order, kind),
    processOne() {
      if (inFlight) return inFlight;
      inFlight = deliverNext().finally(() => { inFlight = null; });
      return inFlight;
    },
    startReconciler() {
      if (running || !configured()) return;
      running = true; controller = new AbortController();
      const tick = async () => {
        try { await api.processOne(); } catch { console.warn("[sheets] Worker database operation failed; retry deferred"); }
        if (running) { timer = setTimeout(tick, SHEETS_GAP_MS); timer.unref(); }
      };
      void tick();
    },
    async stop() {
      running = false; clearTimeout(timer); controller.abort();
      await inFlight?.catch(() => {});
    },
  };
  return api;
}

export const sheetsService = createSheetsWorker();
