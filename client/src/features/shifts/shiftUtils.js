/**
 * Display helpers for drawer sessions.
 */

export function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * "Today" / "Yesterday" / "Sep 17" for a timestamp.
 */
export function humanDay(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function timeHM(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Session length: "16m", "2h 5m". Open shifts measure to now.
 */
export function formatDuration(openedAt, closedAt) {
  if (!openedAt) return null;
  const ms = (closedAt ? new Date(closedAt) : new Date()) - new Date(openedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
