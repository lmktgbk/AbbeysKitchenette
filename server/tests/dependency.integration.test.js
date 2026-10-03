import { createServer } from "node:http";
import { Readable, Writable } from "node:stream";
import express from "express";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudinaryStorage } from "../src/services/cloudinaryStorage.js";
import { uploadAvatar, uploadProductImage } from "../src/middleware/upload.middleware.js";
import { mapUploadError } from "../src/utils/response.js";

const sdk = vi.hoisted(() => ({ uploader: { upload_stream: vi.fn(), destroy: vi.fn() } }));
vi.mock("../src/config/cloudinary.js", () => ({ default: sdk }));
let server, base, mode;
beforeEach(() => {
  mode = "success";
  sdk.uploader.upload_stream.mockReset().mockImplementation((options, callback) => {
    let bytes = 0;
    return new Writable({
      write(chunk, encoding, done) { bytes += chunk.length; done(mode === "stream-error" ? new Error("Fixture stream error") : null); },
      final(done) {
        done();
        queueMicrotask(() => callback(mode === "provider-error" ? new Error("Fixture provider error") : null,
          mode === "invalid-response" ? {} : { secure_url: "https://res.cloudinary.com/fixture/image/upload/test.png", public_id: "fixture/test", bytes }));
      },
    });
  });
  sdk.uploader.destroy.mockReset().mockImplementation((id, options, callback) => callback(null, { result: "ok" }));
});
beforeAll(async () => {
  const app = express();
  app.post("/product", uploadProductImage, (req, res) => res.json(req.file ?? null));
  app.post("/avatar", uploadAvatar, (req, res) => res.json(req.file ?? null));
  app.use((error, req, res, next) => {
    const mapped = mapUploadError(error);
    res.status(mapped?.statusCode ?? 500).json({ error: mapped?.code ?? "UPLOAD_FAILED" });
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

async function send(path, { size = 16, name = "image.png", type = "image/png" } = {}) {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(size)], { type }), name);
  return fetch(base + path, { method: "POST", body: form });
}

describe("patched image upload integration", () => {
  it.each(["product", "avatar"])("preserves the %s upload contract", async (kind) => {
    const response = await send(`/${kind}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ filename: "fixture/test", path: expect.stringContaining("https://"), size: 16 });
    expect(sdk.uploader.upload_stream.mock.calls[0][0]).toMatchObject({ folder: `abbseys-kitchenette/${kind === "product" ? "products" : "avatars"}`, resource_type: "image", timeout: 30000 });
  });
  it("rejects disallowed types before sending bytes to the provider", async () => {
    const response = await send("/product", { name: "file.exe", type: "application/octet-stream" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_FILE_TYPE" });
    expect(sdk.uploader.upload_stream).not.toHaveBeenCalled();
  });
  it.each([["product", 5], ["avatar", 2]])("enforces the %s size limit and removes a truncated upload", async (kind, mb) => {
    const response = await send(`/${kind}`, { size: mb * 1024 * 1024 + 1 });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "FILE_TOO_LARGE" });
    expect(sdk.uploader.destroy).toHaveBeenCalledWith("fixture/test", { resource_type: "image", timeout: 30000 }, expect.any(Function));
  });
  it.each(["provider-error", "stream-error", "invalid-response"])("finishes safely on %s", async (value) => {
    mode = value;
    const response = await send("/product");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "UPLOAD_FAILED" });
  });
  it("completes once when a stream failure precedes a late provider callback", async () => {
    let providerCallback;
    sdk.uploader.upload_stream.mockImplementation((options, callback) => {
      providerCallback = callback;
      return new Writable({ write(chunk, encoding, done) { done(new Error("Fixture")); } });
    });
    const callback = vi.fn();
    cloudinaryStorage({ resource_type: "image" })._handleFile({}, { stream: Readable.from([Buffer.from("fixture")]) }, callback);
    await new Promise((resolve) => setImmediate(resolve));
    providerCallback(new Error("Late provider error"));
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe("patched mail and spreadsheet dependencies", () => {
  it("serializes a real multipart message and attachment without sending email", async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const result = await transport.sendMail({ from: "fixture@example.invalid", to: "staff@example.invalid", subject: "Fixture report", text: "Fixture totals", attachments: [{ filename: "report.txt", content: "sales=10" }] });
    const message = result.message.toString();
    expect(message).toContain("Subject: Fixture report");
    expect(message).toContain("report.txt");
    expect(result.envelope.to).toEqual(["staff@example.invalid"]);
  });
  it("round-trips workbook data with the patched UUID dependency", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Fixture");
    sheet.addRow(["Sales", 123.45]);
    sheet.addRow(["Refunds", 10]);
    const copy = new ExcelJS.Workbook();
    await copy.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(copy.getWorksheet("Fixture").getCell("B1").value).toBe(123.45);
    expect(copy.getWorksheet("Fixture").getCell("B2").value).toBe(10);
  });
});
