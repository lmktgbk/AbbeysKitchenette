/** Shared receipt presentation only: settlements always come from saved server amounts. */
export function receiptMoney(value, symbol = "₱") {
  return `${symbol}${Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Keep printed business time stable when a terminal has a different device timezone. */
export function receiptDate(value) {
  return new Date(value ?? Date.now()).toLocaleString("en-US", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** Describe persisted discount intent; amounts are printed separately, never recalculated. */
export function receiptDiscount(record) {
  if (!record?.discount_type || record.discount_type === "none") return null;
  if (record.discount_type === "senior") return "Senior discount 20%";
  if (record.discount_type === "pwd") return "PWD discount 20%";
  if (record.discount_type === "mixed") return "Mixed item discounts";
  return `${Number(record.discount_percent) > 0 ? `Promo discount ${record.discount_percent}%` : "Promo discount"}${record.discount_label ? ` · ${record.discount_label}` : ""}`;
}
