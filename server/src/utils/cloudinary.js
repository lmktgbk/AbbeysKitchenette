import cloudinary from "../config/cloudinary.js";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";

/** Only storage URLs belonging to this application's account and folders are deletable. */
export function extractPublicId(imageUrl) {
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password || url.search || url.hash) return null;
    const prefix = `/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
    if (!env.CLOUDINARY_CLOUD_NAME || !url.pathname.startsWith(prefix)) return null;
    const path = url.pathname.slice(prefix.length).replace(/^v\d+\//, "");
    if (!/^abbseys-kitchenette\/(products|avatars)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/.test(path)) return null;
    return path.replace(/\.[^.]+$/, "");
  } catch { return null; }
}

/** Fail closed when reference checks are unavailable; never remove a possibly committed image. */
export async function deleteImage(imageUrl) {
  const publicId = extractPublicId(imageUrl);
  if (!publicId) return;
  try {
    const [products, users] = await Promise.all([
      prisma.product.count({ where: { imageUrl } }), prisma.user.count({ where: { imageUrl } }),
    ]);
    if (products || users) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: "image", timeout: 30000 });
  } catch {
    // A retained orphan is recoverable; deleting a referenced asset is not. Retry through reconciliation.
    console.warn("[storage] Image cleanup deferred; reference check or deletion failed");
  }
}
