import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { env } from "../config/env.js";

/**
 * Upload Middleware
 *
 * Handles file uploads using multer + Cloudinary.
 * Images are uploaded to Cloudinary CDN — URLs work from any origin.
 */

// Configure Cloudinary
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage for product images
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "abbseys-kitchenette/products",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    resource_type: "image",
  },
});

// File filter: only allow image types
const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const extOk = allowed.test(file.originalname.split(".").pop().toLowerCase());
  const mimeOk = allowed.test(file.mimetype);

  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
  }
};

// Multer instance for product images
export const uploadProductImage = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: imageFilter,
}).single("image");
