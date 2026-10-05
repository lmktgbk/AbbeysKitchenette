import multer from "multer";
import { cloudinaryStorage } from "../infrastructure/storage/cloudinaryStorage.js";
import { IMAGE_POLICIES, checkImageType } from "../infrastructure/storage/imageValidation.js";
import { deleteImage } from "../infrastructure/storage/imageCleanup.js";
import { AppError } from "../middleware/errorHandler.middleware.js";

/** Enforce per-feature multipart limits and defer rejected-image deletion to durable cleanup. */
function imageUpload(kind) {
  const { maxBytes, allowed } = IMAGE_POLICIES[kind];
  const parse = multer({
    storage: cloudinaryStorage({ folder: `abbseys-kitchenette/${kind}`, allowed_formats: allowed, resource_type: "image" }),
    limits: { fileSize: maxBytes, files: 1, fields: kind === "products" ? 1 : 0, parts: kind === "products" ? 2 : 1, fieldSize: 100 * 1024, fieldNameSize: 100 },
    fileFilter: (_req, file, done) => {
      try { checkImageType(file, allowed); done(null, true); } catch (error) { done(error); }
    },
  }).single("image");
  return (req, res, next) => parse(req, res, error => {
    if (error) return next(error);
    if (req.file) {
      // Compensate definitive rejection; a server/connection failure can hide a late commit.
      // Retain uncertain outcomes for reconciliation rather than deleting a possibly live asset.
      res.once("finish", () => { if (res.statusCode >= 400 && res.statusCode < 500) void deleteImage(req.file.path); });
    }
    next();
  });
}
export const uploadProductImage = imageUpload("products");
export const uploadAvatar = imageUpload("avatars");

/** Multipart metadata and its image travel with the save, eliminating the standalone staging step. */
export function productUploadBody(req, _res, next) {
  if (!req.is("multipart/form-data")) return next();
  try {
    if (typeof req.body?.data !== "string") throw new Error("Missing metadata");
    const data = JSON.parse(req.body.data);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid metadata");
    // Trust the URL returned by the upload adapter over any URL in submitted
    // metadata; subsequent feature validation still validates the merged body.
    req.body = { ...data, ...(req.file ? { image_url: req.file.path } : {}) };
    next();
  } catch {
    next(new AppError(400, "Invalid product metadata", "VALIDATION_ERROR"));
  }
}
