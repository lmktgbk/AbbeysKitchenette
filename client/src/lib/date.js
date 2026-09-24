/** date — locale presets + formatters. WHY it exists: one en-US date/time vocabulary so tables and history read consistently; consumed by batch lists and audit views. State: none. */
const LOCALE = "en-US";

/**
 * Business timezone — the whole web app follows the Asia/Manila calendar day.
 * Display + emit helpers default to this zone so a laptop abroad sees the
 * same business day as the till. See server/src/config/time.js (canonical).
 */
export const BUSINESS_TZ = "Asia/Manila";

const formats = {
  shortDate: { month: "short", day: "numeric", year: "numeric" },
  dateTime: {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  fullDate: { month: "long", day: "numeric", year: "numeric" },
};

/**
 * Format a date using a predefined preset.
 * @param {string|Date} date
 * @param {"shortDate"|"dateTime"|"fullDate"} preset
 * @param {string} [tz] - IANA zone, defaults to the Manila business zone
 * @returns {string}
 */
export function formatDate(date, preset = "shortDate", tz = BUSINESS_TZ) {
  return new Date(date).toLocaleDateString(LOCALE, { ...formats[preset], timeZone: tz });
}

/**
 * Format the time portion of a date.
 * @param {string|Date} date
 * @param {string} [tz] - IANA zone, defaults to the Manila business zone
 * @returns {string}
 */
export function formatTime(date, tz = BUSINESS_TZ) {
  return new Date(date).toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

/**
 * Get YYYY-MM-DD in a timezone (defaults to the Manila business zone).
 * WHY Manila default: emitted strings feed ::date filters server-side, which
 * interpret them as Manila calendar days — device zone must not leak in.
 * @param {Date} [date] - defaults to now
 * @param {string} [tz] - IANA zone
 * @returns {string}
 */
export function toLocalDate(date = new Date(), tz = BUSINESS_TZ) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Manila calendar parts of an instant (for calendar math that must follow
 * the business day, e.g. week presets). Month is 1-based; weekday is 0-6
 * starting Sunday (matches Date#getDay numbering).
 * @param {Date} [date] - defaults to now
 * @returns {{ y: number, m: number, d: number, weekday: number }}
 */
export function manilaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    weekday: weekdays[get("weekday")],
  };
}

/**
 * Manila "today" as a device-local Date at midnight — so existing
 * getDay()/getDate() calendar arithmetic operates on the Manila calendar.
 * @returns {Date}
 */
export function manilaTodayLocal() {
  const { y, m, d } = manilaParts();
  return new Date(y, m - 1, d);
}
