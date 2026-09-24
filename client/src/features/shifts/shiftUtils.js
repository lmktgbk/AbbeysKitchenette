/**
 * Display helpers for drawer sessions (Manila business calendar).
 */
import { toLocalDate, BUSINESS_TZ } from "@/lib/date";

export function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function sameManilaDay(a, b) {
  return toLocalDate(a) === toLocalDate(b);
}

/**
 * "Today" / "Yesterday" / "Sep 17" for a timestamp (Manila business day).
 */
export function humanDay(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  if (sameManilaDay(d, now)) return "Today";
  const yesterday = new Date(now.getTime() - 86400000);
  if (sameManilaDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: BUSINESS_TZ });
}

export function timeHM(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: BUSINESS_TZ });
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
