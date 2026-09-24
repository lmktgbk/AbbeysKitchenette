import prisma from "../../../config/prisma.js";
import { toManilaDateString, toDayKey } from "../../../config/time.js";

export const shiftVarianceSpike = {
  id: "shift_variance_spike",
  name: "Cash Drawer Variance Detection",
  category: "cash",
  enabled: true,
  config: { lookbackDays: 30, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(s."closed_at" AT TIME ZONE 'Asia/Manila') AS day, SUM(ABS(s."variance"))::float AS total
      FROM shifts s WHERE s."status" = 'closed' AND s."closed_at" >= $1
      GROUP BY DATE(s."closed_at" AT TIME ZONE 'Asia/Manila') ORDER BY day ASC
    `, cutoff);
    if (rows.length < 3) return { shouldDetect: false };
    // Manila business "today" — never host-local midnight (see config/time.js).
    const todayStr = toManilaDateString();
    const find = (r) => toDayKey(r.day) === todayStr;
    const todayRow = rows.find(find);
    const todayTotal = todayRow ? Number(todayRow.total) : 0;
    const historical = rows.filter((r) => !find(r)).map((r) => Number(r.total));
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
      title: "Cash Drawer Off Detected",
      description: `Today off by ₱${todayTotal.toLocaleString()} — usually off by ₱${Math.round(mean).toLocaleString()}.`,
      actualValue: todayTotal, expectedValue: mean,
      expectedMin: Math.max(0, mean - 2 * mad * 1.4826), expectedMax: mean + 2 * mad * 1.4826,
      confidence,
    };
  },
  geminiPrompt(data) {
    return `Cash drawer variance: today off ₱${data.todayTotal}, usual small. Give 2-3 short checks for miscount and voids. Under 100 words, numbered.`;
  },
};
