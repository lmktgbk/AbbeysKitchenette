import prisma from "../../../config/prisma.js";
import { toManilaDateString, toDayKey } from "../../../config/time.js";

export const lossSpike = {
  id: "loss_spike",
  name: "Loss Spike Detection",
  category: "loss",
  // Disabled per owner cut — low signal. Re-enable to restore.
  enabled: false,

  config: {
    lookbackDays: 30,
    zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 },
  },

  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        DATE(lr."logged_at" AT TIME ZONE 'Asia/Manila') AS day,
        COUNT(*)::int AS loss_count,
        SUM(lr."total_cost_lost")::float AS loss_cost
      FROM loss_records lr
      WHERE lr."loss_type" = 'cancellation'
        AND lr."logged_at" >= $1
      GROUP BY DATE(lr."logged_at" AT TIME ZONE 'Asia/Manila')
      ORDER BY day ASC
    `, cutoff);

    if (rows.length < 3) return { shouldDetect: false };

    // Manila business "today" — never host-local midnight (see config/time.js).
    const todayStr = toManilaDateString();

    const todayRow = rows.find((r) => toDayKey(r.day) === todayStr);

    const todayCost = todayRow ? Number(todayRow.loss_cost) : 0;
    const todayCount = todayRow ? todayRow.loss_count : 0;
    const historicalCosts = rows.filter((r) => {
      const d = toDayKey(r.day);
      return d !== todayStr;
    }).map((r) => Number(r.loss_cost));

    return {
      shouldDetect: true,
      todayCost,
      todayCount,
      historicalCosts,
      todayStr,
    };
  },

  condition(data, computeZScore, classifySeverity) {
    const { todayCost, todayCount, historicalCosts } = data;
    const { zScore, mean, mad } = computeZScore(historicalCosts, todayCost);

    const config = this.config;
    const severity = classifySeverity(zScore, config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= config.zScoreThresholds.medium;

    const min = Math.max(0, mean - 2 * mad * 1.4826);
    const max = mean + 2 * mad * 1.4826;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);

    return {
      triggered,
      severity,
      title: "Loss Spike Detected",
      description: `${todayCount} items removed with loss today (cost: ₱${Math.round(todayCost).toLocaleString()}) — average is ₱${Math.round(mean).toLocaleString()}.`,
      actualValue: todayCost,
      expectedValue: mean,
      expectedMin: min,
      expectedMax: max,
      confidence,
      todayCount,
    };
  },

  geminiPrompt(data) {
    const { todayCost, todayCount, mean } = data;
    return `You are an AI advisor for a café called Abbey's Kitchenette.

An anomaly was detected in cancellation losses (items removed with loss declared):
- Today's loss cost: ₱${Math.round(todayCost).toLocaleString()}
- Items removed with loss: ${todayCount}
- 30-day average loss cost: ₱${Math.round(mean).toLocaleString()}

This typically happens when cashiers remove order items and declare loss.
Provide 2-3 concise, actionable recommendations to reduce cancellation losses.
Be specific to café operations. Keep response under 100 words.
Format as a numbered list.`;
  },
};
