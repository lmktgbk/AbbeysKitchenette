/**
 * Store hours utility — checks whether the store is currently open.
 *
 * @param {object|null} storeHours - The storeHours JSON from SystemSettings
 * @returns {{ isOpen: boolean, opensAt: string|null, closesAt: string|null }}
 */
export function isStoreOpen(storeHours) {
  // No hours configured (fresh DB) = fail open. Blocking all sales because
  // an admin hasn't set hours yet would be worse than serving after close.
  if (!storeHours) return { isOpen: true, opensAt: null, closesAt: null };

  const now = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = dayNames[now.getDay()];
  const todayHours = storeHours[today];

  if (!todayHours || !todayHours.enabled) {
    return { isOpen: false, opensAt: null, closesAt: null };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = (todayHours.open || "08:00").split(":").map(Number);
  const [closeH, closeM] = (todayHours.close || "20:00").split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
    return { isOpen: false, opensAt: todayHours.open, closesAt: todayHours.close };
  }

  return { isOpen: true, opensAt: todayHours.open, closesAt: todayHours.close };
}
