import cloudinary from "../config/cloudinary.js";

/**
 * Extract Cloudinary public ID from a full image URL.
 *
 * URL format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{public_id}.{format}
 * Example:    https://res.cloudinary.com/dlg9vkkkq/image/upload/abbseys-kitchenette/products/abc123.jpg
 * Public ID:  abbseys-kitchenette/products/abc123
 */
function extractPublicId(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  try {
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split("/");

    // Find the index after "upload" — everything after that is the public ID
    const uploadIndex = pathParts.indexOf("upload");
    if (uploadIndex === -1) return null;

    // Slice from after "upload" to end
    const publicIdParts = pathParts.slice(uploadIndex + 1);

    // Strip version prefix (e.g., v1234567890)
    if (publicIdParts.length > 0 && /^v\d+$/.test(publicIdParts[0])) {
      publicIdParts.shift();
    }

    // Remove file extension from last segment
    const lastPart = publicIdParts[publicIdParts.length - 1];
    const extension = lastPart.split(".").pop();

    // Only strip extension if it looks like a real file extension (short, no spaces)
    if (extension.length <= 5 && !extension.includes(" ")) {
      publicIdParts[publicIdParts.length - 1] = lastPart.replace(
        /\.[^.]+$/,
        "",
      );
    }

    return publicIdParts.join("/");
  } catch {
    return null;
  }
}

/**
 * Delete an image from Cloudinary by its URL.
 * Silently ignores invalid URLs or deletion failures (non-blocking).
 */
export async function deleteImage(imageUrl) {
  const publicId = extractPublicId(imageUrl);
  if (!publicId) return;

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result === "ok") {
      console.log("[cloudinary] Deleted image:", publicId);
    }
  } catch (err) {
    console.error(
      "[cloudinary] Failed to delete image:",
      publicId,
      err.message,
    );
  }
}
