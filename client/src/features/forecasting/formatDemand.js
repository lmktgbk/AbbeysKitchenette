/** Round only for display; calculations retain saved expected-demand precision. */
export function formatDemand(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
