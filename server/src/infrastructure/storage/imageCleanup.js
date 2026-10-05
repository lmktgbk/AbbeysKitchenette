import { env } from "../../config/env.js";
import { storageRepository } from "./storage.repository.js";
import { storageWorker } from "./storage.worker.js";

/** Only storage URLs belonging to this application's account and folders are deletable. */
export function extractPublicId(imageUrl) {
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password || url.search || url.hash) return null;
    const prefix = `/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`;
    if (!env.CLOUDINARY_CLOUD_NAME || !url.pathname.startsWith(prefix)) return null;
    // Accept only the application's original upload URLs. Transformation URLs
    // and unexpected folders cannot be used to schedule arbitrary asset deletion.
    const path = url.pathname.slice(prefix.length).replace(/^v\d+\//, "");
    if (!/^abbseys-kitchenette\/(products|avatars)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/.test(path)) return null;
    return path.replace(/\.[^.]+$/, "");
  } catch { return null; }
}

/** Schedule reconciliation; the worker locks the ledger and verifies references before deletion. */
export async function deleteImage(imageUrl) {
  const publicId = extractPublicId(imageUrl);
  if (!publicId) return;
  try {
    await storageRepository.schedule(publicId);
    storageWorker.wake();
  } catch {
    // A retained orphan is recoverable; deleting a referenced asset is not. Retry through reconciliation.
    console.warn("[storage] Image cleanup scheduling deferred");
  }
}
