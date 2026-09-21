const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const LABELS = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function fmtTime(t) {
  const [h, m] = (t || "08:00").split(":");
  const hr = parseInt(h, 10);
  if (hr === 0) return `12:${m} AM`;
  if (hr === 12) return `12:${m} PM`;
  return hr > 12 ? `${hr - 12}:${m} PM` : `${hr}:${m} AM`;
}

/**
 * Shared store-hours formatter (landing: Location, Contact, Footer).
 * Groups consecutive days with identical hours, e.g.
 * "Mon – Sat: 8:00 AM – 8:00 PM; Sun: Closed".
 */
export function formatStoreHours(hours) {
  if (!hours) return "Hours not set";
  const enabled = DAYS.filter((d) => hours[d]?.enabled);
  if (enabled.length === 0) return "Currently closed";

  const groups = [];
  for (const day of DAYS) {
    const slot = hours[day];
    if (!slot?.enabled) continue;
    const range = `${fmtTime(slot.open)} – ${fmtTime(slot.close)}`;
    const last = groups[groups.length - 1];
    const dayIdx = DAYS.indexOf(day);
    if (last && last.range === range && dayIdx === DAYS.indexOf(last.end) + 1) {
      last.end = day;
    } else {
      groups.push({ start: day, end: day, range });
    }
  }

  return groups
    .map((g) =>
      g.start === g.end
        ? `${LABELS[g.start]}: ${g.range}`
        : `${LABELS[g.start]} – ${LABELS[g.end]}: ${g.range}`,
    )
    .join("; ");
}
