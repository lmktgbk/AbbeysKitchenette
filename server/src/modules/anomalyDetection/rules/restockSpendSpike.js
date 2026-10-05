import prisma from "../../../config/prisma.js";
import { toManilaDateString, toDayKey } from "../../../config/time.js";

export const restockSpendSpike = {
  id: "restock_spend_spike",
  name: "Restock Spend Spike Detection",
  category: "restock",
  // Disabled per owner replan — restock spend is no longer a kept signal.
  enabled: false,
  config: { lookbackDays: 30, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  /** Sum each restock batch's purchased quantity times its unit cost per Manila date. */
  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DATE(rb."restocked_at" AT TIME ZONE 'Asia/Manila') AS day, SUM(rb."quantity_added" * rb."cost_per_unit")::float AS total
      FROM restock_batches rb WHERE rb."restocked_at" >= $1 GROUP BY DATE(rb."restocked_at" AT TIME ZONE 'Asia/Manila') ORDER BY day ASC
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
  /** Classify nonzero restock spending against observed restock dates; the rule remains disabled. */
  condition(data, computeZScore, classifySeverity) {
    const { todayTotal } = data;
    const { zScore, mean, mad } = computeZScore(data.historical, todayTotal);
    const severity = classifySeverity(zScore, this.config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= this.config.zScoreThresholds.medium && todayTotal > 0;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);
    return {
      triggered, severity,
      title: "Restock Spend High Detected",
      description: `Today spent ₱${todayTotal.toLocaleString()} on restocks — usually ₱${Math.round(mean).toLocaleString()}.`,
      actualValue: todayTotal, expectedValue: mean,
      expectedMin: Math.max(0, mean - 2 * mad * 1.4826), expectedMax: mean + 2 * mad * 1.4826,
      confidence,
    };
  },
  /** Request over-ordering checks based on the observed restock purchase spend. */
  geminiPrompt(data) {
    return `Restock spend high today ₱${data.todayTotal}. Give 2-3 short checks for over-ordering. Under 100 words, numbered.`;
  },
};
