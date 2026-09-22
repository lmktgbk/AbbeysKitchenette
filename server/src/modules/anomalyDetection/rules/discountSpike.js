import prisma from "../../../config/prisma.js";

export const discountSpike = {
  id: "discount_spike",
  name: "Discount Spike Detection",
  category: "discount",
  enabled: true,
  config: { lookbackDays: 30, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(o."created_at") AS day, SUM(o."discount_amount")::float AS disc, SUM(o."subtotal_amount")::float AS sub
      FROM orders o WHERE o."status" = 'completed' AND o."created_at" >= $1
      GROUP BY DATE(o."created_at") ORDER BY day ASC
    `, cutoff);
    if (rows.length < 7) return { shouldDetect: false };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toLocaleDateString("en-CA");
    const find = (r) => (r.day instanceof Date ? r.day.toLocaleDateString("en-CA") : String(r.day).split("T")[0]) === todayStr;
    const todayRow = rows.find(find);
    const rate = (r) => (Number(r.sub) > 0 ? Number(r.disc) / Number(r.sub) * 100 : 0);
    const todayRate = todayRow ? rate(todayRow) : 0;
    const todayTotal = todayRow ? Number(todayRow.disc) : 0;
    const historical = rows.filter((r) => !find(r)).map(rate);
    return { shouldDetect: true, todayRate, todayTotal, historical, todayStr };
  },
  condition(data, computeZScore, classifySeverity) {
    const { todayRate, todayTotal } = data;
    const { zScore, mean, mad } = computeZScore(data.historical, todayRate);
    const severity = classifySeverity(zScore, this.config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= this.config.zScoreThresholds.medium && todayRate > 0;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);
    return {
      triggered, severity,
      title: "Discount High Detected",
      description: `Today ${todayRate.toFixed(1)}% of sales is discount (₱${todayTotal.toLocaleString()}) — usually ${mean.toFixed(1)}%.`,
      actualValue: todayRate, expectedValue: mean,
      expectedMin: Math.max(0, mean - 2 * mad * 1.4826), expectedMax: mean + 2 * mad * 1.4826,
      confidence,
    };
  },
  geminiPrompt(data) {
    return `Café discount anomaly: today ${data.todayRate.toFixed(1)}% discount, usual ${data.todayStr} average. Give 2-3 short checks for senior/pwd/promo misuse. Under 100 words, numbered.`;
  },
};
