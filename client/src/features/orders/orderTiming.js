/** One continuous acceptance timer; terminal timestamps freeze it across reloads. */
export function orderTiming(order, now) {
  const status = order?.status;
  if (status === "pending") return { label: "Time since acceptance", value: "Not accepted yet", running: false };
  const running = status === "accepted" || status === "preparing";
  const label = status === "completed" ? "Completed in" : status === "cancelled" ? "Cancelled after" : "Elapsed";
  const unknown = { label, value: "Not recorded", running: false };
  const start = order?.accepted_at ? Date.parse(order.accepted_at) : NaN;
  if (status === "cancelled" && !order.accepted_at && !order.accepted_by && !order.preparing_at && !order.preparing_by) {
    return { label: "Acceptance timer", value: "Cancelled before acceptance", running: false };
  }
  const terminal = status === "completed" ? order.completed_at : status === "cancelled" ? order.cancelled_at : null;
  const end = running ? now : terminal ? Date.parse(terminal) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return unknown;
  const elapsed = end - start;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const value = minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  return { label, value, running, elapsed };
}
