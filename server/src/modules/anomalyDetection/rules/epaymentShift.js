import prisma from "../../../config/prisma.js";

export const epaymentShift = {
  id: "epayment_shift",
  name: "E-Payment Share Shift Detection",
  category: "payment",
  enabled: true,
  config: { lookbackDays: 30, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(o."created_at") AS day,
        COUNT(*) FILTER (WHERE o."payment_method" IN ('gcash','maya'))::float / NULLIF(COUNT(*),0)::float * 100 AS share
      FROM orders o WHERE o."status" = 'completed' AND o."created_at" >= $1
      GROUP BY DATE(o."created_at") ORDER BY day ASC
    `, cutoff);
    if (rows.length < 7) return { shouldDetect: false };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toLocaleDateString("en-CA");
    const find = (r) => (r.day instanceof Date ? r.day.toLocaleDateString("en-CA") : String(r.day).split("T")[0]) === todayStr;
    const todayRow = rows.find(find);
    const todayTotal = todayRow ? Number(todayRow.share) : 0;
    const historical = rows.filter((r) => !find(r)).map((r) => Number(r.share));
    return { shouldDetect: true, todayTotal, historical, todayStr };
  },
  condition(data, computeZScore, classifySeverity) {
    const { todayTotal } = data;
    const { zScore, mean, mad } = computeZScore(data.historical, todayTotal);
    let severity = classifySeverity(zScore, this.config.zScoreThresholds);
    if (severity === "critical") severity = "high";
    if (severity === "high" && Math.abs(zScore) < 2.5) severity = "medium";
    const triggered = Math.abs(zScore) >= this.config.zScoreThresholds.medium;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);
    return {
      triggered, severity,
      title: "E-Payment Shift Detected",
      description: `Today ${todayTotal.toFixed(0)}% e-payments — usually ${mean.toFixed(0)}%.`,
      actualValue: todayTotal, expectedValue: mean,
      expectedMin: Math.max(0, mean - 2 * mad * 1.4826), expectedMax: mean + 2 * mad * 1.4826,
      confidence,
    };
  },
  geminiPrompt() {
    return `E-payment share shifted today. Give 2 short info checks for terminal and cash handling. Under 60 words.`;
  },
};
