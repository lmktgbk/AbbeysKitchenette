import { randomUUID } from "node:crypto";
import cloudinary from "../config/cloudinary.js";
import { IMAGE_POLICIES, sanitizeImage } from "./imageValidation.js";
import { AppError } from "../middleware/errorHandler.middleware.js";
import { storageRepository } from "./storageAssets.repository.js";
import { extractPublicId } from "../utils/cloudinary.js";

let activeUploads = 0;

/** Bounded buffering lets us reject corrupt or truncated images before provider work. */
export function cloudinaryStorage(params) {
  params = { ...params, folder: params.folder ?? "abbseys-kitchenette/products" };
  const { maxBytes, allowed } = IMAGE_POLICIES[params.folder?.endsWith("avatars") ? "avatars" : "products"];
  return {
    async _handleFile(req, file, callback) {
      if (activeUploads >= 4) return callback(new AppError(429, "Image uploads are busy. Retry shortly.", "UPLOAD_BUSY"));
      activeUploads++;
      let upload, timer, finished = false, failed = false, persisting = false;
      const publicId = randomUUID();
      const remoteId = `${params.folder}/${publicId}`;
      const validResult = result => result?.secure_url && result.public_id === remoteId &&
        extractPublicId(result.secure_url) === remoteId && Number.isFinite(result.bytes) && result.bytes > 0;
      const remove = () => {
        void storageRepository.schedule(remoteId).catch(() => console.warn("[storage] Failed upload cleanup deferred"));
      };
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        req.off?.("aborted", onAbort);
        activeUploads--;
        if (error) {
          failed = true;
          upload?.destroy();
          if (upload) remove();
          return callback(error);
        }
        if (!validResult(result)) {
          failed = true;
          upload?.destroy(); remove();
          return callback(new Error("Invalid image storage response"));
        }
        callback(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
      };
      const onAbort = () => {
        file.stream.destroy();
        finish(new AppError(400, "Upload interrupted", "UPLOAD_ABORTED"));
      };
      req.once?.("aborted", onAbort);
      // Bound the complete upload, including clients that drip bytes before provider work starts.
      timer = setTimeout(() => {
        file.stream.destroy();
        finish(new AppError(408, "Image upload timed out", "UPLOAD_TIMEOUT"));
      }, 35000);
      timer.unref();
      try {
        let size = 0;
        const chunks = [];
        for await (const chunk of file.stream) {
          size += chunk.length;
          if (size > maxBytes) throw new AppError(413, "Image is too large", "FILE_TOO_LARGE");
          chunks.push(chunk);
        }
        if (file.stream.truncated) {
          const error = new Error("Image is too large"); error.name = "MulterError"; error.code = "LIMIT_FILE_SIZE";
          return finish(error);
        }
        const clean = await sanitizeImage(Buffer.concat(chunks), file, { allowed, maxBytes });
        if (finished) return;
        if (req.aborted) return finish(new AppError(400, "Upload interrupted", "UPLOAD_ABORTED"));
        // Reserve ownership before any provider call. A crash can never create an untracked new ID.
        try { await storageRepository.reserve(remoteId, req.user?.id); }
        catch { throw new AppError(503, "Image tracking is unavailable. Please retry.", "STORAGE_UNAVAILABLE"); }
        if (finished || req.aborted) return;
        const providerFinished = async (error, result) => {
          if (error || !validResult(result)) {
            return finish(error ?? new Error("Invalid image storage response"));
          }
          if (persisting || (finished && !failed)) return;
          persisting = true;
          try {
            await storageRepository.ready(remoteId, result.secure_url);
            // A late provider success is recorded even when the request has already failed.
            if (finished) return remove();
            finish(null, result);
          } catch { finish(new AppError(503, "Image tracking is unavailable. Please retry.", "STORAGE_UNAVAILABLE")); }
        };
        upload = cloudinary.uploader.upload_stream({ ...params, public_id: publicId, overwrite: false, timeout: 30000 },
          (error, result) => { void providerFinished(error, result); });
        upload.on("error", error => finish(error));
        upload.end(clean);
      } catch (error) { finish(error); }
    },
    _removeFile(req, file, callback) {
      storageRepository.schedule(file.filename).then(() => callback(null), callback);
    },
  };
}
