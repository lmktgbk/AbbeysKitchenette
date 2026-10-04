import sharp from "sharp";
import { extname } from "node:path";
import { AppError } from "../../middleware/errorHandler.middleware.js";

export const IMAGE_POLICIES = {
  products: { maxBytes: 5 * 1024 * 1024, allowed: ["jpeg", "png", "gif", "webp"] },
  avatars: { maxBytes: 2 * 1024 * 1024, allowed: ["jpeg", "png", "webp"] },
};

const formats = { jpeg: { extensions: [".jpg", ".jpeg"], mime: "image/jpeg" },
  png: { extensions: [".png"], mime: "image/png" }, gif: { extensions: [".gif"], mime: "image/gif" },
  webp: { extensions: [".webp"], mime: "image/webp" } };
let processing = 0;

export function checkImageType(file, allowed) {
  const format = Object.keys(formats).find(key => formats[key].extensions.includes(extname(file.originalname || "").toLowerCase()));
  if (!format || !allowed.includes(format) || file.mimetype !== formats[format].mime) {
    throw new AppError(400, "Unsupported image type", "INVALID_FILE_TYPE");
  }
  return format;
}

/** Decode before storage; re-encoding removes metadata and trailing non-image payloads. */
export async function sanitizeImage(buffer, file, { allowed = IMAGE_POLICIES.products.allowed, maxBytes = IMAGE_POLICIES.products.maxBytes } = {}) {
  const format = checkImageType(file, allowed);
  if (buffer.length > maxBytes) throw new AppError(413, "Image is too large", "FILE_TOO_LARGE");
  if (processing >= 2) throw new AppError(429, "Image processing is busy. Retry shortly.", "UPLOAD_BUSY");
  processing++;
  try {
    const image = sharp(buffer, { animated: true, limitInputPixels: 16777216, failOn: "warning" }).timeout({ seconds: 3 });
    const meta = await image.metadata();
    const height = meta.pageHeight || meta.height;
    if (meta.format !== format || !meta.width || !height || meta.width > 4096 || height > 4096 || (meta.pages || 1) > 50 || meta.width * height * (meta.pages || 1) > 16777216) {
      throw new AppError(400, "Invalid image content or dimensions", "INVALID_IMAGE");
    }
    // Preserve animations and alpha; Sharp omits source metadata unless explicitly requested.
    if ((meta.pages || 1) === 1) image.autoOrient();
    const clean = await image.toFormat(format).toBuffer();
    if (clean.length > maxBytes) throw new AppError(413, "Processed image is too large", "FILE_TOO_LARGE");
    return clean;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "Image could not be decoded", "INVALID_IMAGE");
  } finally {
    processing--;
  }
}
