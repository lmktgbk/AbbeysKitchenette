import prisma from "../../../config/prisma.js";

export const refundSpike = {
  id: "refund_spike",
  name: "Refund Spike Detection",
  category: "refund",
  enabled: true,
  config: { lookbackDays: 30, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(pr."refunded_at") AS day, COUNT(*)::int AS cnt, SUM(pr."amount")::float AS total
      FROM payment_refunds pr WHERE pr."refunded_at" >= $1 GROUP BY DATE(pr."refunded_at") ORDER BY day ASC
    `, cutoff);
    if (rows.length < 3) return { shouldDetect: false };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const find = (r) => (r.day instanceof Date ? r.day.toISOString().split("T")[0] : String(r.day).split("T")[0]) === todayStr;
    const todayRow = rows.find(find);
    const todayTotal = todayRow ? Number(todayRow.total) : 0;
    const todayCount = todayRow ? Number(todayRow.cnt) : 0;
    const historical = rows.filter((r) => !find(r)).map((r) => Number(r.total));
    return { shouldDetect: true, todayTotal, todayCount, historical, todayStr };
  },
  condition(data, computeZScore, classifySeverity) {
    const { todayTotal, todayCount, historical } = data;
    const { zScore, mean, mad } = computeZScore(historical, todayTotal);
    const severity = classifySeverity(zScore, this.config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= this.config.zScoreThresholds.medium && todayTotal > 0;
    const min = Math.max(0, mean - 2 * mad * 1.4826);
    const max = mean + 2 * mad * 1.4826;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);
    return {
      triggered, severity,
      title: "Refund Spike Detected",
      description: `Today ${todayCount} refunds ₱${todayTotal.toLocaleString()} — usually ₱${Math.round(mean).toLocaleString()}.`,
      actualValue: todayTotal, expectedValue: mean, expectedMin: min, expectedMax: max, confidence,
    };
  },
  geminiPrompt(data) {
    return `Café Abbey's Kitchenette refund anomaly: today ${data.todayCount} refunds ₱${data.todayTotal}, usual ₱${Math.round(data.historical.reduce((a,b)=>a+b,0)/Math.max(1,data.historical.length))}. Give 2-3 short actions to check quality and void process. Under 100 words, numbered list.`;
  },
};
