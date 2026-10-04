import express from "express";
import sharp from "sharp";
import { Writable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ references: 0, fail: false, ambiguous: false, url: null, calls: [], destroy: vi.fn(), upload: vi.fn() }));
vi.mock("../src/config/env.js", () => ({ env: { CLOUDINARY_CLOUD_NAME: "fixture" } }));
vi.mock("../src/config/prisma.js", () => ({ default: { product: { count: async () => h.references }, user: { count: async () => 0 } } }));
vi.mock("../src/config/cloudinary.js", () => ({ default: { uploader: { upload_stream: h.upload, destroy: h.destroy } } }));
vi.mock("../src/infrastructure/storage/storageAssets.repository.js", () => ({ storageRepository: {
  reserve: vi.fn(async () => "fixture"), ready: vi.fn(async () => {}), schedule: vi.fn(async () => {}),
} }));
import { storageRepository } from "../src/infrastructure/storage/storageAssets.repository.js";
vi.mock("../src/middleware/authenticate.middleware.js", () => ({ default: (req, res, next) => {
  if (req.headers.authorization !== "fixture") return res.sendStatus(401);
  req.user = { id: "fixture-admin", role: "admin" }; next();
} }));
vi.mock("../src/modules/products/product.service.js", () => ({ productService: new Proxy({}, { get: (_, method) => async (...args) => {
  h.calls.push({ method, args });
  if (h.ambiguous) { h.references = 1; throw new Error("Read after commit failed"); }
  if (h.fail) throw Object.assign(new Error("Fixture database failure"), h.fail === "constraint" ? { code: "P2003" } : {});
  h.references = 1;
  return args[method === "create" ? 0 : 1];
} }) }));
import router from "../src/modules/products/product.routes.js";
import errorHandler from "../src/middleware/errorHandler.middleware.js";
let server, base, png;
beforeAll(async () => {
  png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  const app = express(); app.use(express.json()); app.use("/products", router); app.use(errorHandler);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/products`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  h.references = 0; h.fail = false; h.ambiguous = false; h.calls = []; h.destroy.mockReset().mockImplementation((_id, _options, done) => { done?.(null, { result: "ok" }); return Promise.resolve({ result: "ok" }); });
  vi.mocked(storageRepository.schedule).mockClear();
  h.upload.mockReset().mockImplementation((options, done) => new Writable({ write(_chunk, _encoding, callback) { callback(); }, final(callback) {
    h.url = `https://res.cloudinary.com/fixture/image/upload/${options.folder}/${options.public_id}.png`;
    callback(); queueMicrotask(() => done(null, { secure_url: h.url, public_id: `${options.folder}/${options.public_id}`, bytes: 100 }));
  } }));
});
const product = { product_name: "Fixture", subcategory_id: 1, variants: [{ size_name: "Regular", price: 10 }] };
async function save(data = product, path = "", method = "POST", auth = true) {
  const form = new FormData(); form.append("data", JSON.stringify(data)); form.append("image", new Blob([png], { type: "image/png" }), "image.png");
  return fetch(base + path, { method, headers: auth ? { Authorization: "fixture" } : {}, body: form });
}
describe("image and product save HTTP flow", () => {
  it("authorizes before processing multipart bytes", async () => {
    expect((await save(product, "", "POST", false)).status).toBe(401); expect(h.upload).not.toHaveBeenCalled();
  });
  it.each([["", "POST", "create", 201], ["/123e4567-e89b-42d3-a456-426614174000", "PATCH", "update", 200]])("saves metadata and the provider URL together: %s %s", async (path, method, action, status) => {
    const response = await save(product, path, method);
    expect(response.status).toBe(status);
    expect((await response.json()).data.product.image_url).toBe(h.url);
    expect(h.calls[0]).toMatchObject({ method: action }); expect(h.calls[0].args.at(-1)).toBe(true);
    expect(h.destroy).not.toHaveBeenCalled();
  });
  it("cleans up a new asset when metadata validation rejects the save", async () => {
    expect((await save({ ...product, product_name: "" })).status).toBe(400);
    expect(h.calls).toHaveLength(0); await vi.waitFor(() => expect(storageRepository.schedule).toHaveBeenCalledTimes(1));
    expect(h.destroy).not.toHaveBeenCalled();
  });
  it("retains an asset after an uncertain database failure", async () => {
    h.fail = true; const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await save()).status).toBe(500); await new Promise(resolve => setImmediate(resolve)); expect(h.destroy).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("cleans up after a definitive database constraint rejection", async () => {
    h.fail = "constraint";
    expect((await save()).status).toBe(409);
    await vi.waitFor(() => expect(storageRepository.schedule).toHaveBeenCalledTimes(1));
    expect(h.destroy).not.toHaveBeenCalled();
  });
  it("retains a committed asset when the final response read fails", async () => {
    h.ambiguous = true; const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await save()).status).toBe(500); expect(h.references).toBe(1);
    await new Promise(resolve => setImmediate(resolve)); expect(h.destroy).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("rejects the obsolete standalone upload without creating an orphan", async () => {
    expect((await save(product, "/upload-image")).status).toBe(410); expect(h.upload).not.toHaveBeenCalled();
  });
});
