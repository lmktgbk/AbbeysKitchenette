import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareProductImage, productImageMetadata } from "../../client/src/features/products/imagePayload.js";

// Real encoded fixtures exercise container parsing; browser mocks isolate canvas
// decisions without contacting the application database or upload provider.
async function fixture(format, width = 1200, height = 600) {
  const bytes = await sharp({ create: { width, height, channels: 4, background: "red" } }).toFormat(format).toBuffer();
  return new File([bytes], `photo.${format}`, { type: `image/${format}` });
}
afterEach(() => vi.unstubAllGlobals());

describe("product image preparation", () => {
  it.each(["png", "jpeg", "webp", "gif"])("reads real %s dimensions", async format => {
    expect(productImageMetadata(await (await fixture(format)).arrayBuffer())).toEqual({ width: 1200, height: 600, animated: format === "gif" });
  });
  it("resizes proportionally and releases decoded pixels", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas = { getContext: () => ({ drawImage }), toBlob: callback => callback(new Blob(["encoded"], { type: "image/png" })) };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 5062, height: 4824, close }));
    vi.stubGlobal("document", { createElement: () => canvas });
    const result = await prepareProductImage(await fixture("png"));
    expect([canvas.width, canvas.height]).toEqual([1000, 953]);
    expect(result.resized).toBe(true);
    expect(result.file.type).toBe("image/png");
    expect(close).toHaveBeenCalledOnce();
  });
  it.each(["png", "gif"])("keeps small static images and animation bytes unchanged (%s)", async format => {
    const file = await fixture(format, 500, 250);
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 500, height: 250, close }));
    expect(await prepareProductImage(file)).toEqual({ file, resized: false });
    expect(close).toHaveBeenCalledOnce();
  });
  it("rejects unsafe source dimensions before browser decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(prepareProductImage(await fixture("png", 8193, 2))).rejects.toThrow("too large");
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects oversized animations without flattening them", async () => {
    await expect(prepareProductImage(await fixture("gif", 4097, 2))).rejects.toThrow("Animated images");
  });
  it("reports corrupt headers and decoder failures clearly", async () => {
    await expect(prepareProductImage(new File(["corrupt"], "bad.png", { type: "image/png" }))).rejects.toThrow("could not be read");
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new DOMException("native details", "InvalidStateError")));
    await expect(prepareProductImage(await fixture("png"))).rejects.toThrow("could not be decoded");
  });
  it("releases decoded pixels when encoding fails", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1200, height: 600, close }));
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback(null) }) });
    await expect(prepareProductImage(await fixture("png"))).rejects.toThrow("could not be resized");
    expect(close).toHaveBeenCalledOnce();
  });
});
