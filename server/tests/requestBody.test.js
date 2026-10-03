import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import express from "express";
import { gzipSync } from "node:zlib";
import { requestBodyParsers } from "../src/middleware/requestBody.middleware.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
import { mapRequestError } from "../src/utils/response.js";

let server, base;
beforeAll(async () => {
  const app = express(); app.use(requestBodyParsers());
  app.post("/body", (req, res) => res.json({ body: req.body })); app.use(errorHandler);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/body`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
async function send(body, headers = {}) {
  const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
  return { status: response.status, body: await response.json() };
}
describe("Bounded request parsing", () => {
  it("accepts ordinary JSON and form data", async () => {
    expect(await send('{"name":"Cafe"}')).toEqual({ status: 200, body: { body: { name: "Cafe" } } });
    expect((await send("name=Cafe", { "Content-Type": "application/x-www-form-urlencoded" })).body.body).toEqual({ name: "Cafe" });
  });
  it.each(['{"password":"private-test-value",', 'null', '42'])("rejects malformed/primitive JSON without logging its contents: %s", async body => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await send(body);
      expect(response.status).toBe(400); expect(response.body.error).toBe("INVALID_BODY");
      expect(JSON.stringify(response.body)).not.toContain("private-test-value"); expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it.each(["json", "form", "gzip"])("rejects oversized %s bodies after decoding", async kind => {
    const body = JSON.stringify({ text: "x".repeat(102400) });
    const r = kind === "gzip" ? await send(gzipSync(body), { "Content-Encoding": "gzip" })
      : kind === "form" ? await send(`text=${"x".repeat(102401)}`, { "Content-Type": "application/x-www-form-urlencoded" }) : await send(body);
    expect(r.status).toBe(413); expect(r.body.error).toBe("BODY_TOO_LARGE");
  });
  it("rejects excessive form fields and nesting", async () => {
    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    expect((await send(Array.from({ length: 101 }, (_, n) => `f${n}=1`).join("&"), headers)).status).toBe(413);
    expect((await send(`a${"[b]".repeat(12)}=1`, headers)).status).toBe(400);
  });
  it.each([{ "Content-Encoding": "unknown" }, { "Content-Type": "application/json; charset=iso-8859-1" }])("rejects unsupported encodings with 415", async headers => {
    expect((await send("{}", headers)).status).toBe(415);
  });
  it("maps aborted/invalid-length requests and ignores arbitrary status values", () => {
    expect(mapRequestError({ type: "request.aborted", message: "private" })).toMatchObject({ statusCode: 400 });
    expect(mapRequestError({ type: "request.size.invalid" })).toMatchObject({ statusCode: 400 });
    expect(mapRequestError({ status: 400, message: "private" })).toBeNull();
  });
});
