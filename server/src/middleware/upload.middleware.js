import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

/**
 * Upload Middleware
 *
 * Handles file uploads using multer + Cloudinary.
 * Images are uploaded to Cloudinary CDN — URLs work from any origin.
 */

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

// Cloudinary storage for product images
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "abbseys-kitchenette/products",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    resource_type: "image",
  },
});

// Multer instance for product images
export const uploadProductImage = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: imageFilter,
}).single("image");

// Cloudinary storage for user avatars
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "abbseys-kitchenette/avatars",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    resource_type: "image",
  },
});

// Multer instance for user avatars
export const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: imageFilter,
}).single("image");
