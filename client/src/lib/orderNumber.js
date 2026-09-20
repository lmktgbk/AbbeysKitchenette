/**
 * Order number display (BR-04: padded YYMMDDNNN stored as Int).
 * 260918001 → "260918-001". Legacy short counters fall back to #0001 style.
 */

export function formatOrderNumber(n) {
  const s = String(n ?? "");
  if (/^\d{9}$/.test(s)) return `${s.slice(0, 6)}-${s.slice(6)}`;
  return s.padStart(4, "0");
}

export function orderNumberLabel(n) {
  if (n == null || n === "") return "—";
  return `#${formatOrderNumber(n)}`;
}
