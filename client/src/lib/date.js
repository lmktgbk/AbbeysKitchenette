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
