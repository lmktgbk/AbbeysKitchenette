import crypto from "node:crypto";
import { env } from "../../config/env.js";

export class SheetsError extends Error {
  constructor(code, retryable = true) { super(code); this.code = code; this.retryable = retryable; }
}

/** Every Google call, including response decoding, shares the request deadline. */
async function readResponse(response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new SheetsError(`SHEETS_HTTP_${response.status}`, response.status === 429 || response.status === 408 || response.status >= 500);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SheetsError("SHEETS_EMPTY_RESPONSE");
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new SheetsError("SHEETS_RESPONSE_TOO_LARGE", false); }
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new SheetsError("SHEETS_INVALID_RESPONSE"); }
  } finally { reader.releaseLock(); }
}

export function createSheetsTransport({ fetchImpl = fetch, config = env, timeoutMs = 10000 } = {}) {
  let token, expiresAt = 0, tokenRequest;
  const grids = new Map();
  const request = async (url, options, signal) => {
    try {
      const response = await fetchImpl(url, { ...options, redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
      return await readResponse(response);
    } catch (error) {
      if (error instanceof SheetsError) throw error;
      throw new SheetsError(signal?.aborted ? "SHEETS_INTERRUPTED" : "SHEETS_NETWORK_OR_TIMEOUT");
    }
  };
  async function accessToken(signal) {
    if (token && Date.now() < expiresAt) return token;
    if (tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
      let assertion;
      try {
        const now = Math.floor(Date.now() / 1000);
        const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
        const claims = Buffer.from(JSON.stringify({ iss: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })).toString("base64url");
        assertion = `${header}.${claims}.${crypto.sign("sha256", Buffer.from(`${header}.${claims}`), config.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")).toString("base64url")}`;
      } catch { throw new SheetsError("SHEETS_AUTH_CONFIG", false); }
      const data = await request("https://oauth2.googleapis.com/token", { method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) }, signal);
      if (typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 4096 || !Number.isInteger(data.expires_in) || data.expires_in < 60 || data.expires_in > 86400) throw new SheetsError("SHEETS_INVALID_TOKEN", false);
      token = data.access_token; expiresAt = Date.now() + (data.expires_in - 60) * 1000; return token;
    })();
    try { return await tokenRequest; } finally { tokenRequest = null; }
  }
  async function google(spreadsheetId, suffix, options = {}, signal) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(spreadsheetId)) throw new SheetsError("SHEETS_INVALID_DESTINATION", false);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await request(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${suffix}`, {
          ...options, headers: { Authorization: `Bearer ${await accessToken(signal)}`, "Content-Type": "application/json" },
        }, signal);
      } catch (error) {
        if (error.code !== "SHEETS_HTTP_401" || attempt === 1) throw error;
        token = null;
      }
    }
  }
  const valuesPath = range => `/values/${encodeURIComponent(range)}`;
  async function grid(spreadsheetId, signal) {
    const cached = grids.get(spreadsheetId);
    if (cached && cached.expiresAt > Date.now()) return cached;
    const data = await google(spreadsheetId, "?fields=sheets(properties(sheetId,title,gridProperties))", {}, signal);
    const properties = data.sheets?.find(sheet => sheet.properties?.title === "Orders")?.properties;
    if (!Number.isInteger(properties?.sheetId) || !Number.isInteger(properties.gridProperties?.rowCount) || properties.gridProperties.rowCount < 1 || !Number.isInteger(properties.gridProperties.columnCount)) throw new SheetsError("SHEETS_ORDERS_TAB_REQUIRED", false);
    const result = { sheetId: properties.sheetId, rows: properties.gridProperties.rowCount,
      columns: properties.gridProperties.columnCount, expiresAt: Date.now() + 60000 };
    if (grids.size >= 20) grids.delete(grids.keys().next().value);
    grids.set(spreadsheetId, result); return result;
  }
  async function grow(spreadsheetId, row, signal) {
    const properties = await grid(spreadsheetId, signal);
    const requests = [];
    if (row > properties.rows) requests.push({ appendDimension: { sheetId: properties.sheetId, dimension: "ROWS", length: Math.max(1000, row - properties.rows) } });
    if (properties.columns < 12) requests.push({ appendDimension: { sheetId: properties.sheetId, dimension: "COLUMNS", length: 12 - properties.columns } });
    if (requests.length) {
      await google(spreadsheetId, ":batchUpdate", { method: "POST", body: JSON.stringify({ requests }) }, signal);
      for (const { appendDimension: dimension } of requests) {
        if (dimension.dimension === "ROWS") properties.rows += dimension.length;
        else properties.columns += dimension.length;
      }
    }
  }
  return {
    async initialize(spreadsheetId, signal) {
      const properties = await grid(spreadsheetId, signal);
      await grow(spreadsheetId, properties.rows, signal);
      const header = await google(spreadsheetId, valuesPath("Orders!L1"), {}, signal);
      const existing = header.values?.[0]?.[0];
      if (existing && existing !== "Sync Event ID") throw new SheetsError("SHEETS_EVENT_COLUMN_OCCUPIED", false);
      if (!existing) await google(spreadsheetId, valuesPath("Orders!L1") + "?valueInputOption=RAW", { method: "PUT", body: JSON.stringify({ values: [["Sync Event ID"]] }) }, signal);
      // Starting beyond the existing grid preserves history without downloading the whole sheet.
      return properties.rows + 1;
    },
    async deliver(event, signal) {
      const values = event.payload?.values;
      if (event.payload?.version !== 1 || !Array.isArray(values) || values.length !== 12 || values[11] !== event.eventId || !Number.isInteger(event.sheetRow) || event.sheetRow < 2 || values.some(value => !["string", "number"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value)))) throw new SheetsError("SHEETS_INVALID_SNAPSHOT", false);
      await grow(event.spreadsheetId, event.sheetRow, signal);
      const range = `Orders!A${event.sheetRow}:L${event.sheetRow}`;
      const data = await google(event.spreadsheetId, valuesPath(range) + "?valueRenderOption=UNFORMATTED_VALUE", {}, signal);
      const current = data.values?.[0] || [];
      if (current.some(value => value !== "" && value !== null) && current[11] !== event.eventId) throw new SheetsError("SHEETS_ROW_CONFLICT", false);
      if (JSON.stringify(current) === JSON.stringify(values)) return;
      // Repeating this PUT writes the same immutable event to its reserved row, never appends.
      await google(event.spreadsheetId, valuesPath(range) + "?valueInputOption=RAW", { method: "PUT", body: JSON.stringify({ values: [values] }) }, signal);
    },
  };
}
