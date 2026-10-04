import { createServer } from "node:http";
import { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import express from "express";
import sharp from "sharp";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cloudinaryStorage } from "../src/infrastructure/storage/cloudinaryStorage.js";
import { uploadAvatar, uploadProductImage } from "../src/middleware/upload.middleware.js";
import { mapUploadError } from "../src/utils/response.js";
import { storageRepository } from "../src/infrastructure/storage/storageAssets.repository.js";

const sdk = vi.hoisted(() => ({ uploader: { upload_stream: vi.fn(), destroy: vi.fn() } }));
vi.mock("../src/config/cloudinary.js", () => ({ default: sdk }));
vi.mock("../src/config/env.js", () => ({ env: { CLOUDINARY_CLOUD_NAME: "fixture" } }));
vi.mock("../src/infrastructure/storage/storageAssets.repository.js", () => ({ storageRepository: {
  reserve: vi.fn(async () => "fixture"), ready: vi.fn(async () => {}), schedule: vi.fn(async () => {}),
} }));
let server, base, mode;
beforeEach(() => {
  mode = "success";
  vi.mocked(storageRepository.reserve).mockReset().mockResolvedValue("fixture");
  vi.mocked(storageRepository.ready).mockReset().mockResolvedValue(undefined);
  vi.mocked(storageRepository.schedule).mockReset().mockResolvedValue(undefined);
  sdk.uploader.upload_stream.mockReset().mockImplementation((options, callback) => {
    let bytes = 0;
    return new Writable({
      write(chunk, encoding, done) { bytes += chunk.length; done(mode === "stream-error" ? new Error("Fixture stream error") : null); },
      final(done) {
        done();
        queueMicrotask(() => callback(mode === "provider-error" ? new Error("Fixture provider error") : null,
          mode === "invalid-response" ? {} : { secure_url: `https://res.cloudinary.com/fixture/image/upload/${options.folder}/${options.public_id}.png`, public_id: `${options.folder}/${options.public_id}`, bytes }));
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
    res.status(mapped?.statusCode ?? error.statusCode ?? 500).json({ error: mapped?.code ?? error.code ?? "UPLOAD_FAILED" });
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

async function send(path, { size, name = "image.png", type = "image/png" } = {}) {
  const form = new FormData();
  form.append("image", new Blob([size ? new Uint8Array(size) : await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer()], { type }), name);
  return fetch(base + path, { method: "POST", body: form });
}

describe("patched image upload integration", () => {
  it("records ownership before upload and known success before returning the file", async () => {
    const response = await send("/product"); expect(response.status).toBe(200);
    const body = await response.json();
    expect(storageRepository.reserve).toHaveBeenCalledWith(body.filename, undefined);
    expect(storageRepository.ready).toHaveBeenCalledWith(body.filename, body.path);
    expect(storageRepository.reserve.mock.invocationCallOrder[0]).toBeLessThan(sdk.uploader.upload_stream.mock.invocationCallOrder[0]);
    expect(sdk.uploader.upload_stream.mock.calls[0][0].overwrite).toBe(false);
  });
  it("fails closed before provider work when durable tracking is unavailable", async () => {
    vi.mocked(storageRepository.reserve).mockRejectedValue(Error("Private database failure"));
    const response = await send("/product"); expect(response.status).toBe(503);
    expect(sdk.uploader.upload_stream).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "STORAGE_UNAVAILABLE" });
  });
  it("retains a known provider asset if its success cannot be recorded", async () => {
    vi.mocked(storageRepository.ready).mockRejectedValue(Error("Private database failure"));
    const response = await send("/product"); expect(response.status).toBe(503);
    expect(sdk.uploader.destroy).not.toHaveBeenCalled();
  });
  it("tracks late provider success after client cancellation without completing the request twice", async () => {
    let providerCallback, options;
    sdk.uploader.upload_stream.mockImplementation((config, callback) => {
      options = config; providerCallback = callback;
      return new Writable({ write(_chunk, _encoding, done) { done(); } });
    });
    const callback = vi.fn(), req = new EventEmitter();
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    await cloudinaryStorage({})._handleFile(req, { originalname: "image.png", mimetype: "image/png", stream: Readable.from([png]) }, callback);
    req.emit("aborted"); const id = `${options.folder}/${options.public_id}`;
    providerCallback(null, { secure_url: `https://res.cloudinary.com/fixture/image/upload/${id}.png`, public_id: id, bytes: png.length });
    await vi.waitFor(() => expect(storageRepository.ready).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(storageRepository.schedule).toHaveBeenCalledWith(id));
    expect(callback).toHaveBeenCalledTimes(1); expect(callback.mock.calls[0][0].code).toBe("UPLOAD_ABORTED");
  });
  it.each(["product", "avatar"])("preserves the %s upload contract", async (kind) => {
    const response = await send(`/${kind}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ filename: expect.stringContaining("abbseys-kitchenette/"), path: expect.stringContaining("https://"), size: expect.any(Number) });
    expect(sdk.uploader.upload_stream.mock.calls[0][0]).toMatchObject({ folder: `abbseys-kitchenette/${kind === "product" ? "products" : "avatars"}`, resource_type: "image", timeout: 30000 });
  });
  it("rejects disallowed types before sending bytes to the provider", async () => {
    const response = await send("/product", { name: "file.exe", type: "application/octet-stream" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_FILE_TYPE" });
    expect(sdk.uploader.upload_stream).not.toHaveBeenCalled();
  });
  it.each([["product", 5], ["avatar", 2]])("enforces the %s size limit before creating a remote asset", async (kind, mb) => {
    const response = await send(`/${kind}`, { size: mb * 1024 * 1024 + 1 });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "FILE_TOO_LARGE" });
    expect(sdk.uploader.upload_stream).not.toHaveBeenCalled();
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
    await cloudinaryStorage({ resource_type: "image" })._handleFile({}, { originalname: "image.png", mimetype: "image/png", stream: Readable.from([await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer()]) }, callback);
    await new Promise((resolve) => setImmediate(resolve));
    providerCallback(new Error("Late provider error"));
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("a duplicate successful callback never removes a completed upload", async () => {
    let providerCallback, providerOptions;
    sdk.uploader.upload_stream.mockImplementation((options, callback) => {
      providerOptions = options;
      providerCallback = callback;
      return new Writable({ write(_chunk, _encoding, done) { done(); } });
    });
    const callback = vi.fn();
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    await cloudinaryStorage({ resource_type: "image" })._handleFile({}, { originalname: "image.png", mimetype: "image/png", stream: Readable.from([png]) }, callback);
    const id = `${providerOptions.folder}/${providerOptions.public_id}`;
    const result = { secure_url: `https://res.cloudinary.com/fixture/image/upload/${id}.png`, public_id: id, bytes: png.length };
    providerCallback(null, result); providerCallback(null, result);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    expect(callback).toHaveBeenCalledTimes(1); expect(sdk.uploader.destroy).not.toHaveBeenCalled();
  });
  it("aborted input releases upload capacity and never starts provider work", async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const req = new EventEmitter(), callback = vi.fn();
      const pending = cloudinaryStorage({ resource_type: "image" })._handleFile(req, { stream: new Readable({ read() {} }) }, callback);
      req.emit("aborted"); await pending;
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ code: "UPLOAD_ABORTED" }));
    }
    expect(sdk.uploader.upload_stream).not.toHaveBeenCalled();
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
