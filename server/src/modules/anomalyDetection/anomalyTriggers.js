const rulesByAction = {
  ORDER_COMPLETED: ["revenue_anomaly", "fulfillment_outlier", "discount_spike"],
  ORDER_CANCELLED: ["refund_spike", "cancellation_spike"],
  ORDER_ITEM_REMOVED: ["refund_spike", "cancellation_spike"],
  STOCK_LOSS_DECLARED: ["loss_spike"],
};

/** Audit intent delivery also admits its scan; restart cannot lose the trigger. */
export async function captureAnomalyTrigger(tx, eventId, audit) {
  let rules = rulesByAction[audit.action], context = null;
  if (["SHIFT_CLOSED", "SHIFT_FORCE_CLOSED"].includes(audit.action) && Number(audit.details?.variance)) {
    rules = ["shift_variance_spike"];
    context = { shift: { shiftId: audit.targetId, expected: audit.details.expected, actual: audit.details.actual, variance: audit.details.variance } };
  }
  if (!rules) return;
  if (audit.action === "ORDER_ITEM_REMOVED" && !(Number(audit.details?.refund_amount) > 0)) return;
  await tx.automationRun.create({ data: { runKey: `anomaly:${eventId}`, kind: "anomaly", scheduledAt: new Date(),
    result: { rules, context } } });
}
