import prisma from "../../../config/prisma.js";

export const stockoutSpike = {
  id: "stockout_spike",
  name: "Out of Stock Spike Detection",
  category: "stockout",
  // Disabled per owner cut — low signal. Re-enable to restore.
  enabled: false,
  config: { lookbackDays: 30, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(sa."triggered_at") AS day, COUNT(DISTINCT sa."ingredient_id")::int AS cnt
      FROM stock_alerts sa WHERE sa."alert_type" IN ('out_of_stock','low_stock') AND sa."triggered_at" >= $1
      GROUP BY DATE(sa."triggered_at") ORDER BY day ASC
    `, cutoff);
    if (rows.length < 3) return { shouldDetect: false };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toLocaleDateString("en-CA");
    const find = (r) => (r.day instanceof Date ? r.day.toLocaleDateString("en-CA") : String(r.day).split("T")[0]) === todayStr;
    const todayRow = rows.find(find);
    const todayTotal = todayRow ? Number(todayRow.cnt) : 0;
    const historical = rows.filter((r) => !find(r)).map((r) => Number(r.cnt));
    return { shouldDetect: true, todayTotal, historical, todayStr };
  },
  condition(data, computeZScore, classifySeverity) {
    const { todayTotal } = data;
    const { zScore, mean, mad } = computeZScore(data.historical, todayTotal);
    const severity = classifySeverity(zScore, this.config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= this.config.zScoreThresholds.medium && todayTotal > 0;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);
    return {
      triggered, severity,
      title: "Many Out of Stock Detected",
      description: `Today ${todayTotal} items out or low — usually ${Math.round(mean)}.`,
      actualValue: todayTotal, expectedValue: mean,
      expectedMin: Math.max(0, mean - 2 * mad * 1.4826), expectedMax: mean + 2 * mad * 1.4826,
      confidence,
    };
  },
  geminiPrompt(data) {
    return `Many items out of stock today (${data.todayTotal}). Give 2-3 short checks for supplier and ordering. Under 100 words, numbered.`;
  },
};
