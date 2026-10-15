/** Practical fallback for saved findings without an AI response; never infer a cause. */
const guidance = {
  revenue: "Review completed sales and store opening hours for the reported date. If it is still in progress, check again after closing before treating a low total as unusual.",
  loss: "Review the loss records, affected ingredients and batches. Check recorded quantities and reasons before deciding whether handling or purchasing needs adjustment.",
  cancellation: "Review the affected orders and cancellation reasons. Check whether stock availability, entry errors or customer changes explain the increase.",
  fulfillment: "Review order preparation and completion times. Check queue volume and kitchen delays before changing staffing or workflow.",
  refund: "Review refunded orders, amounts and reasons. Confirm refunds match the original payments and approved cancellations.",
  discount: "Review discounted orders and the promotions applied. Confirm eligibility and discount amounts before changing any promotion.",
  cash: "Open the shift and review the opening float, cash payments, refunds and closing notes. Recount the drawer and document the difference; do not change sales just to balance it.",
  restock: "Review recent deliveries, quantities and purchase costs. Check for duplicate entries and planned bulk purchases before treating spending as a problem.",
  stockout: "Review the affected ingredients and recent deductions. Confirm physical stock, then review reorder needs before recording a delivery.",
  supplier: "Compare this batch's unit cost with earlier purchases, checking units, quantities and supplier invoices before accepting a price increase.",
  payment: "Review the payment-method breakdown and recorded payments. Confirm the change reflects actual customer payments rather than entry errors.",
  sales_hours: "Check opening hours and completed-order timestamps. Confirm whether quiet hours reflect normal trading or missing sales records.",
};

export function anomalyGuidance(anomaly) {
  const aiText = typeof anomaly.geminiInsight === "string" ? anomaly.geminiInsight.trim() : "";
  const security = {
    security_account_lockout: "Confirm with the account owner whether these attempts were theirs. Review login records and help them recover access if needed. This alert does not impose another lockout.",
    security_outside_store: "Ask staff whether they used mobile data or another Wi-Fi network. Verify the store's current public IP and saved network settings before making changes. A denial does not prove a correct password or an attack.",
    security_otp_exhausted: "Ask the account owner to use the latest code and review whether they requested this login. Follow the existing sign-in or resend flow; never request or share their OTP.",
  };
  return { text: aiText || security[anomaly.ruleId] || guidance[anomaly.category] || "Review the related records and confirm the reported values before taking corrective action.", aiAssisted: Boolean(aiText) };
}
