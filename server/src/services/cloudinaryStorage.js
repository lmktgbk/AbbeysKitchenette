import { pipeline } from "node:stream";
import cloudinary from "../config/cloudinary.js";

/** Multer storage backed by the current Cloudinary SDK; keeps bytes off local disk. */
export function cloudinaryStorage(params) {
  return {
    _handleFile(req, file, callback) {
      let finished = false;
      let upload;
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        if (error) {
          upload?.destroy();
          return callback(error);
        }
        if (!result?.secure_url || !result?.public_id || !Number.isFinite(result.bytes)) {
          upload?.destroy();
          return callback(new Error("Invalid image storage response"));
        }
        callback(null, { path: result.secure_url, filename: result.public_id, size: result.bytes });
      };
      try {
        upload = cloudinary.uploader.upload_stream({ ...params, timeout: 30000 }, finish);
        // Propagate either stream's failure once, rather than leaving multipart requests pending.
        pipeline(file.stream, upload, (error) => { if (error) finish(error); });
      } catch (error) {
        finish(error);
      }
    },
    _removeFile(req, file, callback) {
      cloudinary.uploader.destroy(file.filename, { resource_type: "image", timeout: 30000 }, callback);
    },
  };
}
