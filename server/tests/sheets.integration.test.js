import http from "node:http";
import crypto from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("../src/config/env.js", () => ({ env: {} }));
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
import { createSheetsTransport, SheetsError } from "../src/modules/sheets/sheets.transport.js";
import { createSheetsWorker } from "../src/modules/sheets/sheets.service.js";
let server, base, config, mode, cells, calls, rows, columns;
beforeAll(async () => {
  config = { GOOGLE_SERVICE_ACCOUNT_EMAIL: "fixture@example.invalid", GOOGLE_PRIVATE_KEY: crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) };
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://fixture.invalid"), path = decodeURIComponent(url.pathname);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString(), body = text ? (path.endsWith("/token") ? null : JSON.parse(text)) : null;
    calls.push({ method: req.method, path, query: url.search, body });
    const json = (data, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
    if (path === "/token") return json({ access_token: "fixture-token", expires_in: 3600 });
    if (mode === "401") return json({}, 401);
    if (mode === "429") return json({}, 429);
    if (mode === "hang") return;
    if (mode === "slow-body") { res.writeHead(200, { "Content-Type": "application/json" }); res.write('{"fixture":'); return; }
    if (mode === "redirect") { res.writeHead(302, { Location: base + "/untrusted" }); res.end(); return; }
    if (!path.includes("/values/") && !path.endsWith(":batchUpdate")) return json({ sheets: [{ properties: { sheetId: 7, title: "Orders", gridProperties: { rowCount: rows, columnCount: columns } } }] });
    if (path.endsWith(":batchUpdate")) {
      for (const { appendDimension: change } of body.requests) { if (change.dimension === "ROWS") rows += change.length; else columns += change.length; }
      return json({ replies: [] });
    }
    const range = path.split("/values/")[1];
    if (req.method === "GET") {
      if (range === "Orders!A:M") return json({ values: cells.get(range) || [] });
      if (range === "Orders!A1:M1" && !cells.has(range)) {
        const header = Array(13).fill("");
        header[11] = cells.get("Orders!L1")?.[0] || "";
        header[12] = cells.get("Orders!M1")?.[0] || "";
        return json({ values: [header] });
      }
      return json({ values: cells.has(range) ? [cells.get(range)] : [] });
    }
    if (req.method === "PUT") {
      cells.set(range, body.values[0]);
      if (mode === "lost-write" && range !== "Orders!L1") { mode = "normal"; res.destroy(); return; }
      return json({ updatedRows: 1 });
    }
    return json({}, 400);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  mode = "normal"; cells = new Map(); calls = []; rows = 3; columns = 11;
  const header = ["Orders #", "Date", "Time", "Customer", "Table", "Items", "Gross", "Discount", "Net", "Payment", "Cashier"];
  cells.set("Orders!A1:M1", header);
  cells.set("Orders!A:M", [header, ["#old1"], ["#old2"]]);
});
// Happy-path HTTP checks tolerate parallel suite startup; failure cases use explicit short deadlines.
const transport = (timeoutMs = 2000) => createSheetsTransport({ config, timeoutMs, fetchImpl: (url, options) => {
  const provider = new URL(url); return fetch(base + provider.pathname + provider.search, options);
} });
const makeEvent = () => {
  const eventId = crypto.randomUUID();
  return { id: 1, eventId, spreadsheetId: "fixture-sheet", sheetRow: null, status: "pending", attempts: 0,
    payload: { version: 1, values: ["#1", "2026-10-03", "12:30", "=IMPORTXML(fixture)", "1", "1x Coffee", 10, 0, 10, "cash", "Fixture", eventId] } };
};
function ledger(event = makeEvent()) {
  let gate = false, owner, nextRow;
  const repository = {
    async claim() {
      if (gate || event.status !== "pending") return null;
      gate = true; owner = crypto.randomUUID(); event.status = "processing"; event.attempts++;
      return { ...structuredClone(event), owner, key: "fixture" };
    },
    async destination() { return nextRow ? { nextRow } : null; },
    async initialize(_id, row) { nextRow ||= row; },
    async reserve() { event.sheetRow ||= nextRow++; return event.sheetRow; },
    async owns(claim) { return owner === claim.owner; },
    async finish(claim, result) {
      if (claim.owner !== owner) return 0;
      Object.assign(event, { status: result.status, lastError: result.code }); return 1;
    },
    async release() { gate = false; },
  };
  return { event, repository };
}
const worker = (repository, provider = transport()) => createSheetsWorker({ repository, transport: provider, configured: () => true });

describe("bounded Google Sheets transport", () => {
  it("preserves the existing grid, adds the identity column and reserves subsequent rows", async () => {
    expect(await transport().initialize("fixture-sheet")).toBe(4);
    expect(cells.get("Orders!L1")).toEqual(["Sync Event ID"]); expect(columns).toBe(12);
  });
  it("does not overwrite an occupied event-ID header", async () => {
    cells.set("Orders!L1", ["Private notes"]);
    cells.get("Orders!A1:M1")[11] = "Private notes";
    await expect(transport().initialize("fixture-sheet")).rejects.toMatchObject({ code: "SHEETS_EVENT_COLUMN_OCCUPIED", retryable: false });
    expect(cells.get("Orders!L1")).toEqual(["Private notes"]);
  });
  it("starts immediately after actual data rather than allocated grid capacity", async () => {
    rows = 2000;
    expect(await transport().initialize("fixture-sheet")).toBe(4);
  });
  it("restores headers on a fully cleared sheet and starts the first sale at row two", async () => {
    cells.clear(); rows = 2000;
    expect(await transport().initialize("fixture-sheet", undefined, { requireEmpty: true })).toBe(2);
    expect(cells.get("Orders!A1:M1")[12]).toBe("Sync Event ID");
    expect(cells.get("Orders!A1:M1")[11]).toBe("Cashier");
  });
  it("refuses resetting a populated sheet without writing headers or changing data", async () => {
    await expect(transport().initialize("fixture-sheet", undefined, { requireEmpty: true }))
      .rejects.toMatchObject({ code: "SHEETS_RESET_REQUIRES_EMPTY_DATA" });
    expect(calls.some(call => call.method === "PUT")).toBe(false);
  });
  it("preserves the existing Adjustment and Cashier columns and uses M for identity", async () => {
    cells.set("Orders!A1:M1", ["Orders #", "Date", "Time", "Customer", "Table", "Adjustment", "Items", "Gross", "Discount", "Net", "Payment", "Cashier"]);
    const provider = transport();
    expect(await provider.initialize("fixture-sheet")).toBe(4);
    expect(cells.get("Orders!M1")).toEqual(["Sync Event ID"]);
    expect(cells.has("Orders!L1")).toBe(false);
    const event = makeEvent(); event.sheetRow = 4; event.kind = "paid";
    await provider.deliver(event);
    const row = cells.get("Orders!A4:M4");
    expect(row).toEqual([...event.payload.values.slice(0, 5), "", ...event.payload.values.slice(5)]);
    expect(row[11]).toBe("Fixture"); expect(row[12]).toBe(event.eventId);
    await provider.deliver(event);
    expect(calls.filter(call => call.method === "PUT" && call.path.endsWith("A4:M4"))).toHaveLength(1);
  });
  it("maps distinct adjustments into the dedicated column without moving totals", async () => {
    cells.set("Orders!A1:M1", ["Orders #", "Date", "Time", "Customer", "Table", "Adjustment", "Items", "Gross", "Discount", "Net", "Payment", "Cashier"]);
    const event = makeEvent(); event.sheetRow = 4; event.kind = "adjusted";
    await transport().deliver(event);
    const row = cells.get("Orders!A4:M4");
    expect(row[5]).toBe("ADJUSTED"); expect(row[9]).toBe(10); expect(row[10]).toBe("cash");
  });
  it("does not overwrite notes already occupying M in the twelve-column layout", async () => {
    const header = ["Orders #", "Date", "Time", "Customer", "Table", "Adjustment", "Items", "Gross", "Discount", "Net", "Payment", "Cashier", "Notes"];
    cells.set("Orders!A1:M1", header);
    await expect(transport().initialize("fixture-sheet")).rejects.toMatchObject({ code: "SHEETS_EVENT_COLUMN_OCCUPIED" });
    expect(calls.some(call => call.method === "PUT")).toBe(false);
  });
  it("persistent 401 retries authentication once and then stops", async () => {
    mode = "401";
    await expect(transport().initialize("fixture-sheet")).rejects.toMatchObject({ code: "SHEETS_HTTP_401" });
    expect(calls.filter(call => call.path === "/token")).toHaveLength(2);
    expect(calls.filter(call => call.path !== "/token")).toHaveLength(2);
  });
  it.each(["hang", "slow-body"])("bounds %s failures, including response decoding", async failure => {
    mode = failure;
    await expect(transport(50).initialize("fixture-sheet")).rejects.toMatchObject({ code: "SHEETS_NETWORK_OR_TIMEOUT" });
  });
  it("does not follow redirects carrying the service token", async () => {
    mode = "redirect";
    await expect(transport().initialize("fixture-sheet")).rejects.toMatchObject({ code: "SHEETS_NETWORK_OR_TIMEOUT" });
    expect(calls.some(call => call.path === "/untrusted")).toBe(false);
  });
});

describe("durable Sheets delivery behavior", () => {
  it("lost write acknowledgement recovers the same row without another write", async () => {
    const { event, repository } = ledger(), first = worker(repository);
    mode = "lost-write";
    await first.processOne(); expect(event.status).toBe("pending");
    await worker(repository).processOne(); expect(event.status).toBe("synced");
    expect(cells.get(`Orders!A${event.sheetRow}:L${event.sheetRow}`)).toEqual(event.payload.values);
    expect(calls.filter(call => call.method === "PUT" && call.path.includes(":L"))).toHaveLength(1);
    expect(calls.filter(call => call.method === "PUT" && call.path.includes(":L"))[0].query).toContain("valueInputOption=RAW");
  });
  it("a database acknowledgement failure after delivery retains the original reserved row", async () => {
    const { event, repository } = ledger();
    const original = repository.finish; let fail = true;
    repository.finish = async (...args) => { if (fail && args[1].status === "synced") { fail = false; throw new Error("Fixture database failure"); } return original(...args); };
    await worker(repository).processOne(); expect(event.status).toBe("pending"); const row = event.sheetRow;
    await worker(repository).processOne(); expect(event.status).toBe("synced"); expect(event.sheetRow).toBe(row);
    expect(calls.filter(call => call.method === "PUT" && call.path.includes(":L"))).toHaveLength(1);
  });
  it("concurrent replicas claim only one delivery", async () => {
    const { event, repository } = ledger();
    await Promise.all([worker(repository).processOne(), worker(repository).processOne()]);
    expect(event.status).toBe("synced"); expect(event.attempts).toBe(1);
  });
  it("quota errors defer work and exhausted retries become visible blocked events", async () => {
    const { event, repository } = ledger(); mode = "429";
    await worker(repository).processOne(); expect(event.status).toBe("pending"); expect(event.lastError).toBe("SHEETS_HTTP_429");
    event.attempts = 7; await worker(repository).processOne(); expect(event.status).toBe("blocked");
  });
  it("does not overwrite a foreign row after manual changes", async () => {
    const { event, repository } = ledger(); event.sheetRow = 2;
    cells.set("Orders!A2:L2", ["foreign row"]);
    await worker(repository).processOne(); expect(event.status).toBe("blocked"); expect(event.lastError).toBe("SHEETS_ROW_CONFLICT");
    expect(cells.get("Orders!A2:L2")).toEqual(["foreign row"]);
  });
  it("startup delivers saved work and stopping aborts hanging calls", async () => {
    const { event, repository } = ledger(), active = worker(repository, transport(10000)); mode = "hang";
    active.startReconciler(); await vi.waitFor(() => expect(calls.length).toBeGreaterThan(1));
    await active.stop(); expect(event.status).toBe("pending"); expect(event.lastError).toBe("SHEETS_INTERRUPTED");
    mode = "normal"; await worker(repository).processOne(); expect(event.status).toBe("synced");
  });
  it("does not retry permanent snapshot errors", async () => {
    const { event, repository } = ledger(); event.payload.values[11] = "wrong-event-id";
    await worker(repository).processOne(); expect(event.status).toBe("blocked"); expect(event.lastError).toBe("SHEETS_INVALID_SNAPSHOT");
  });
});
