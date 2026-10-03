import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMl, proxyMl } from "../src/services/mlClient.js";
import { env } from "../src/config/env.js";

vi.mock("../src/config/env.js", () => ({ env: { ML_SERVICE_KEY: "a".repeat(64), ML_REQUEST_TIMEOUT_MS: 100 } }));

let server;
let seen;
beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ key: req.headers["x-ml-service-key"], method: req.method, path: req.url });
    if (req.url === "/slow") return;
    if (req.url === "/slow-body") { res.writeHead(200, { "Content-Type": "application/json" }); res.write("{"); return; }
    if (req.url === "/redirect") { res.writeHead(302, { Location: "/health" }); res.end(); return; }
    if (req.url === "/malformed") { res.end("broken json"); return; }
    const status = Number(req.url.slice(1)) || 200;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  env.FORECAST_URL = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { seen = []; env.ML_SERVICE_KEY = "a".repeat(64); });
afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

describe("internal ML transport", () => {
  it.each(["GET", "POST"])("authenticates %s and consumes JSON", async (method) => {
    const response = await fetchMl("/health", { method, body: method === "POST" ? {} : undefined });
    expect(await response.json()).toEqual({ status: "ok" });
    expect(seen).toEqual([{ key: "a".repeat(64), method, path: "/health" }]);
  });
  it.each([undefined, "weak"])("fails closed with invalid configuration %s", async (key) => {
    env.ML_SERVICE_KEY = key;
    await expect(fetchMl("/health")).rejects.toThrow("credential");
    expect(seen).toEqual([]);
  });
  it.each([401, 403])("does not expose service %s as a user authentication failure", async (status) => {
    await expect(fetchMl(`/${status}`)).rejects.toThrow("service authentication failed");
  });
  it.each([409, 422, 500])("preserves upstream business status %s", async (status) => {
    expect(await fetchMl(`/${status}`)).toEqual({ ok: false, status });
  });
  it.each(["/slow", "/slow-body"])("bounds the complete request at %s", async (path) => {
    await expect(fetchMl(path)).rejects.toThrow();
  });
  it("rejects malformed JSON", async () => { await expect(fetchMl("/malformed")).rejects.toThrow(); });
  it("maps internal authentication failure to a safe proxy availability response", async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await proxyMl(res, "/401", { serviceLabel: "Forecast", fallbackCode: "FAILED", okMessage: "OK" });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: "FORECAST_SERVICE_UNAVAILABLE", data: null }));
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(env.ML_SERVICE_KEY);
    log.mockRestore();
  });
  it("returns successful upstream data through the proxy envelope", async () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await proxyMl(res, "/health", { serviceLabel: "MBA", fallbackCode: "FAILED", okMessage: "Success" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: "Success", data: { status: "ok" } });
  });
  it("does not follow a redirect with the credential", async () => {
    await expect(fetchMl("/redirect")).rejects.toThrow();
    expect(seen).toHaveLength(1);
  });
  it.each(["//example.com/", "https://example.com/", "/\\example.com/"])("rejects origin-changing path %s", async (path) => {
    await expect(fetchMl(path)).rejects.toThrow("Invalid ML service path");
    expect(seen).toEqual([]);
  });
});
