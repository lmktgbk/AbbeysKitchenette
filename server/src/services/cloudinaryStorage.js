import { randomUUID } from "node:crypto";
import cloudinary from "../config/cloudinary.js";
import { IMAGE_POLICIES, sanitizeImage } from "./imageValidation.js";
import { AppError } from "../middleware/errorHandler.middleware.js";

let activeUploads = 0;

/** Bounded buffering lets us reject corrupt or truncated images before provider work. */
export function cloudinaryStorage(params) {
  const { maxBytes, allowed } = IMAGE_POLICIES[params.folder?.endsWith("avatars") ? "avatars" : "products"];
  return {
    async _handleFile(req, file, callback) {
      if (activeUploads >= 4) return callback(new AppError(429, "Image uploads are busy. Retry shortly.", "UPLOAD_BUSY"));
      activeUploads++;
      let upload, timer, finished = false, failed = false;
      const publicId = randomUUID();
      const remoteId = params.folder ? `${params.folder}/${publicId}` : publicId;
      const remove = () => {
        try {
          cloudinary.uploader.destroy(remoteId, { resource_type: "image", timeout: 30000 }, error => {
            if (error) console.warn("[storage] Failed upload cleanup deferred");
          });
        } catch { console.warn("[storage] Failed upload cleanup deferred"); }
      };
      const finish = (error, result) => {
        if (finished) {
          // An upload may complete remotely after the stream has failed locally.
          if (failed && result?.public_id && !error) remove();
          return;
        }
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
        if (!result?.secure_url || !result?.public_id || !Number.isFinite(result.bytes)) {
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
        upload = cloudinary.uploader.upload_stream({ ...params, public_id: publicId, timeout: 30000 }, finish);
        upload.on("error", error => finish(error));
        upload.end(clean);
      } catch (error) { finish(error); }
    },
    _removeFile(req, file, callback) {
      cloudinary.uploader.destroy(file.filename, { resource_type: "image", timeout: 30000 }, callback);
    },
  };
}
