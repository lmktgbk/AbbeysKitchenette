import prisma from "../../../config/prisma.js";

export const fulfillmentOutlier = {
  id: "fulfillment_outlier",
  name: "Fulfillment Time Outlier",
  category: "fulfillment",
  enabled: true,

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
        DATE(o."created_at") AS day,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY o."fulfillment_minutes")::float AS median_minutes
      FROM orders o
      WHERE o."status" = 'completed'
        AND o."fulfillment_minutes" IS NOT NULL
        AND o."created_at" >= $1
      GROUP BY DATE(o."created_at")
      HAVING COUNT(*) >= 3
      ORDER BY day ASC
    `, cutoff);

    if (rows.length < 7) return { shouldDetect: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toLocaleDateString("en-CA");

    const todayRow = rows.find((r) => r.day instanceof Date
      ? r.day.toLocaleDateString("en-CA") === todayStr
      : String(r.day).split("T")[0] === todayStr);

    const todayMedian = todayRow ? Number(todayRow.median_minutes) : null;
    if (todayMedian === null) return { shouldDetect: false };

    const historical = rows.filter((r) => {
      const d = r.day instanceof Date ? r.day.toLocaleDateString("en-CA") : String(r.day).split("T")[0];
      return d !== todayStr;
    }).map((r) => Number(r.median_minutes));

    return {
      shouldDetect: true,
      todayMedian,
      historical,
      todayStr,
    };
  },

  condition(data, computeZScore, classifySeverity) {
    const { todayMedian, historical } = data;
    const { zScore, mean, mad } = computeZScore(historical, todayMedian);

    const config = this.config;
    const severity = classifySeverity(zScore, config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= config.zScoreThresholds.medium;

    const min = Math.max(0, mean - 2 * mad * 1.4826);
    const max = mean + 2 * mad * 1.4826;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);

    return {
      triggered,
      severity,
      title: `Fulfillment Time ${zScore > 0 ? "Spike" : "Drop"} Detected`,
      description: `Today's median fulfillment time is ${Math.round(todayMedian)} min — expected ${Math.round(mean)} min (range: ${Math.round(min)} – ${Math.round(max)} min).`,
      actualValue: todayMedian,
      expectedValue: mean,
      expectedMin: min,
      expectedMax: max,
      confidence,
    };
  },

  geminiPrompt(data) {
    const { todayMedian, mean } = data;
    const direction = todayMedian > mean ? "slower" : "faster";
    return `You are an AI advisor for a café called Abbey's Kitchenette.

An anomaly was detected in order fulfillment time:
- Today's median fulfillment: ${Math.round(todayMedian)} minutes
- 30-day median: ${Math.round(mean)} minutes
- Orders are being fulfilled ${direction} than usual

Provide 2-3 concise, actionable recommendations.
Consider: kitchen staffing, order complexity, workflow bottlenecks.
Be specific to café operations. Keep response under 100 words.
Format as a numbered list.`;
  },
};
