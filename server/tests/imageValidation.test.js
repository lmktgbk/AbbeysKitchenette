import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { sanitizeImage } from "../src/infrastructure/storage/imageValidation.js";
const image = (format, width = 2) => sharp({ create: { width, height: 2, channels: 4, background: "red" } }).toFormat(format).toBuffer();
const file = format => ({ originalname: `image.${format}`, mimetype: `image/${format}` });

describe("decoded image boundary", () => {
  it.each(["png", "jpeg", "webp", "gif"])("preserves a real %s image", async format => {
    const clean = await sanitizeImage(await image(format), file(format));
    const metadata = await sharp(clean).metadata();
    expect(metadata.format).toBe(format);
    expect(metadata.width).toBe(2);
    expect(metadata.exif).toBeUndefined();
  });
  it.each([
    { originalname: "image.png.exe", mimetype: "image/png" },
    { originalname: "image.pngjunk", mimetype: "image/png" },
    { originalname: "image.png", mimetype: "text/image/png" },
    { originalname: "image.png", mimetype: "image/jpeg" },
  ])("rejects MIME/extension tricks", async spoof => {
    await expect(sanitizeImage(await image("png"), spoof)).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" });
  });
  it("rejects corrupt bytes and a valid image disguised as a different supported type", async () => {
    await expect(sanitizeImage(Buffer.from("not an image"), file("png"))).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    await expect(sanitizeImage(await image("jpeg"), file("png"))).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  it("rejects dimensions outside the processing budget", async () => {
    await expect(sanitizeImage(await image("png", 4097), file("png"))).rejects.toMatchObject({ code: "IMAGE_DIMENSIONS_EXCEEDED" });
  });
  it("distinguishes native pixel-budget rejection from corrupt bytes", async () => {
    const oversized = await sharp({ create: { width: 4097, height: 4097, channels: 3, background: "red" } }).png().toBuffer();
    await expect(sanitizeImage(oversized, file("png"))).rejects.toMatchObject({ code: "IMAGE_DIMENSIONS_EXCEEDED" });
  });
  it("removes metadata and trailing script bytes by fully re-encoding", async () => {
    const source = await sharp(await image("jpeg")).withExif({ IFD0: { Copyright: "private-fixture" } }).jpeg().toBuffer();
    const clean = await sanitizeImage(Buffer.concat([source, Buffer.from("<script>fixture</script>")]), file("jpeg"));
    expect((await sharp(clean).metadata()).exif).toBeUndefined();
    expect(clean.includes(Buffer.from("<script>"))).toBe(false);
  });
  it("rejects animated formats on the avatar path", async () => {
    await expect(sanitizeImage(await image("gif"), file("gif"), { allowed: ["jpeg", "png", "webp"] })).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" });
  });
});
