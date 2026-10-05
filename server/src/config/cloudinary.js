import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";

// Configure one provider client for this process; upload/deletion policy lives
// in storage infrastructure rather than in these credential settings.
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
