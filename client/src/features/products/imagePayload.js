import { productImageError } from "./productValidation";

/**
 * Builds one product save request containing metadata and optional replacement-image bytes.
 * No file uses JSON, including a null image_url for removal. A new file uses multipart
 * with named data/image parts; the API owns replacement and old-asset cleanup.
 */
export function productPayload(data) {
  // Strip the browser File from metadata so it cannot be accidentally serialized as an empty JSON object.
  const { image_file, ...metadata } = data;
  if (!image_file) return { body: metadata, config: undefined };
  const form = new FormData();
  form.append("data", JSON.stringify(metadata));
  form.append("image", image_file);
  return { body: form, config: { headers: { "Content-Type": "multipart/form-data" } } };
}

const MAX_SOURCE_SIDE = 8192;
const MAX_SOURCE_PIXELS = 32_000_000;
const TARGET_SIDE = 1000;

/** Read bounded container metadata before browser decoding. This is a preflight,
 * not content authentication: the API still decodes and sanitizes uploaded bytes.
 * Animation flags prevent canvas from silently discarding GIF/WebP/APNG frames.
 */
export function productImageMetadata(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const text = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
  try {
    if (view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && text(12, 4) === "IHDR") {
      let animated = false;
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = view.getUint32(offset);
        if (offset + 12 + length > bytes.length) throw Error("Truncated PNG");
        if (text(offset + 4, 4) === "acTL") animated = true;
        offset += length + 12;
      }
      return { width: view.getUint32(16), height: view.getUint32(20), animated };
    }
    if (["GIF87a", "GIF89a"].includes(text(0, 6))) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true), animated: true };
    }
    if (text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
      const kind = text(12, 4);
      if (kind === "VP8X") {
        const uint24 = offset => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
        if (bytes.length < 30) throw Error("Truncated WebP");
        return { width: uint24(24) + 1, height: uint24(27) + 1, animated: Boolean(bytes[20] & 2) };
      }
      if (kind === "VP8L" && bytes[20] === 0x2f) {
        const size = view.getUint32(21, true);
        return { width: (size & 0x3fff) + 1, height: (size >>> 14 & 0x3fff) + 1, animated: false };
      }
      if (kind === "VP8 " && text(23, 3) === "\x9d\x01\x2a") {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, animated: false };
      }
    }
    if (view.getUint16(0) === 0xffd8) {
      // Walk JPEG segments to a start-of-frame marker; never scan compressed pixels.
      let offset = 2;
      while (offset < bytes.length && bytes[offset] === 0xff) {
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0xda || marker === 0xd9) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3), animated: false };
        }
        offset += length;
      }
    }
  } catch { /* Invalid/truncated headers receive the same user-facing rejection below. */ }
  throw Error("Image content could not be read. Choose another image.");
}

/** Bound source decoding independently of the smaller server upload dimensions. */
function checkSourceDimensions({ width, height }) {
  if (!width || !height || width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE || width * height > MAX_SOURCE_PIXELS) {
    throw Error("Image is too large to resize safely. Use at most 8192 pixels per side and 32 megapixels.");
  }
}

/** Resize static images proportionally; never upscale or permanently crop them.
 * A 5 MB input cap and header dimensions are checked before decoding. The decoded
 * dimensions are checked again because untrusted headers cannot authorize canvas work.
 */
export async function prepareProductImage(file) {
  const message = productImageError(file);
  if (message) throw Error(message);
  const metadata = productImageMetadata(await file.arrayBuffer());
  checkSourceDimensions(metadata);
  if (metadata.animated && (metadata.width > 4096 || metadata.height > 4096)) {
    throw Error("Animated images must be at most 4096 pixels per side. Resize the animation before uploading.");
  }
  let bitmap;
  try {
    if (typeof createImageBitmap !== "function") throw Error("Image processing is unavailable in this browser. Try a current browser.");
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    checkSourceDimensions(bitmap);
    const scale = Math.min(1, TARGET_SIDE / Math.max(bitmap.width, bitmap.height));
    if (metadata.animated || scale === 1) return { file, resized: false };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw Error("Image resizing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type, 0.9));
    if (!blob) throw Error("Image could not be resized. Choose another image.");
    // Some browsers fall back to PNG when an encoder is unavailable. Align the
    // new filename with actual output MIME rather than sending misleading metadata.
    const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
    const extension = extensions[blob.type];
    if (!extension) throw Error("Image resizing produced an unsupported format.");
    const resized = new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, { type: blob.type });
    const outputError = productImageError(resized);
    if (outputError) throw Error(outputError);
    return { file: resized, resized: true };
  } catch (error) {
    if (error.name === "InvalidStateError" || error.name === "EncodingError") {
      throw Error("Image could not be decoded. Choose a valid image.", { cause: error });
    }
    throw error;
  } finally {
    bitmap?.close();
  }
}
