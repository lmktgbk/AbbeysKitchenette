/** Validate the cashier's text before numeric conversion can hide malformed input. */
export function validateTender(value) {
  if (value === "") return "Enter the amount received.";
  if (/^0[0-9]/.test(value)) {
    return "Remove leading zeros. Enter 500 instead of 0500.";
  }
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value) || !Number.isFinite(Number(value))) {
    return "Enter a valid amount with up to two decimal places.";
  }
  return null;
}
