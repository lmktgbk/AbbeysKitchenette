/**
 * Business Time Contract
 *
 * WHY it exists: the whole web app runs on the Asia/Manila business day.
 * Device clocks (POS browser), the app-host clock, and the DB session clock
 * (UTC on managed Postgres) must never leak into business dating implicitly.
 *
 * Rules:
 * 1. `BUSINESS_TZ` is the single source of truth for the business zone.
 * 2. Business-day derivation at write time comes from the DB clock
 *    (`getBusinessDate`) — immune to device AND app-host clock tampering.
 * 3. JS-built range bounds use `manilaDayStart/manilaDayEndExclusive`
 *    (same math as the audit-log module) — never `new Date("YYYY-MM-DD")`
 *    or `toISOString().split("T")` (UTC-day) for business ranges.
 * 4. Raw SQL day comparisons use `::date` on DATE columns (tz-proof) or
 *    `(now() AT TIME ZONE 'Asia/Manila')::date` for "today".
 */

export const BUSINESS_TZ = "Asia/Manila";

/**
 * SQL fragment for "today" on the Manila business calendar, evaluated on the
 * DB clock. WHY: CURRENT_DATE resolves in the DB session tz (UTC on managed
 * Postgres) — 00:00–08:00 Manila it returns yesterday. Interpolate wherever
 * a business-day boundary is needed:
 *   `WHERE o.order_date = ${MANILA_TODAY_SQL}`
 */
export const MANILA_TODAY_SQL = `(now() AT TIME ZONE '${BUSINESS_TZ}')::date`;

/** Manila offset in minutes (PHT has no DST). */
export const MANILA_OFFSET_MINUTES = 8 * 60;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parts(dayStr) {
  const [y, m, d] = dayStr.split("-").map(Number);
  return { y, m, d };
}

/**
 * Start of a Manila calendar day as an absolute instant.
 * @param {string} dayStr - "YYYY-MM-DD" (Manila calendar day)
 * @returns {Date} - 00:00:00 Asia/Manila as a JS Date (UTC instant)
 */
export function manilaDayStart(dayStr) {
  const { y, m, d } = parts(dayStr);
  return new Date(Date.UTC(y, m - 1, d) - MANILA_OFFSET_MINUTES * 60 * 1000);
}

/**
 * Exclusive upper bound for a Manila calendar day (start of next Manila day).
 * @param {string} dayStr - "YYYY-MM-DD" (Manila calendar day)
 * @returns {Date} - 00:00:00 next-day Asia/Manila as a JS Date (UTC instant)
 */
export function manilaDayEndExclusive(dayStr) {
  const { y, m, d } = parts(dayStr);
  return new Date(Date.UTC(y, m - 1, d + 1) - MANILA_OFFSET_MINUTES * 60 * 1000);
}

/**
 * Format an instant as a Manila calendar day.
 * @param {Date} [date] - defaults to now
 * @returns {string} - "YYYY-MM-DD" in Asia/Manila
 */
export function toManilaDateString(date = new Date()) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MINUTES * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Manila wall-clock parts for an instant (weekday + clock), without
 * depending on the host tz. WHY: getDay()/getHours() read the host zone —
 * store-hours gates and weekday logic must follow the Manila business day.
 * @param {Date} [date] - defaults to now
 * @returns {{ weekday: string, minutes: number }} - e.g. { weekday: "monday", minutes: 495 }
 */
export function manilaNowParts(date = new Date()) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MINUTES * 60 * 1000);
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return {
    weekday: dayNames[shifted.getUTCDay()],
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * Deterministic calendar-day key for a PG DATE value.
 * WHY: node-pg returns DATE columns as JS Dates at UTC midnight;
 * formatting them with host-local toLocaleDateString shifts the day on
 * hosts behind UTC. UTC parts recover the stored calendar day exactly,
 * on any host, in any zone.
 * @param {Date|string} value - PG DATE (Date) or ISO string
 * @returns {string} - "YYYY-MM-DD"
 */
export function toDayKey(value) {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).split("T")[0];
}

/**
 * Assert a client-supplied day string is a well-formed calendar date.
 * @param {string} dayStr
 * @returns {boolean}
 */
export function isDayString(dayStr) {
  return typeof dayStr === "string" && DAY_RE.test(dayStr);
}

/**
 * DB-authoritative business date (Manila calendar day per the DB clock).
 * WHY DB clock: immune to device clock lies AND app-host clock drift.
 * @param {object} client - Prisma client or transaction client
 * @returns {Promise<string>} - "YYYY-MM-DD" in Asia/Manila
 */
export async function getBusinessDate(client) {
  const rows = await client.$queryRawUnsafe(
    `SELECT ((now() AT TIME ZONE '${BUSINESS_TZ}'))::date::text AS day`,
  );
  return rows[0]?.day;
}
