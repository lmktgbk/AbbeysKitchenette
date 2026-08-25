const LOCALE = "en-US";

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
 * @returns {string}
 */
export function formatDate(date, preset = "shortDate") {
  return new Date(date).toLocaleDateString(LOCALE, formats[preset]);
}

/**
 * Format the time portion of a date.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatTime(date) {
  return new Date(date).toLocaleTimeString(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Get YYYY-MM-DD in the user's local timezone.
 * @param {Date} [date] - defaults to now
 * @returns {string}
 */
export function toLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
