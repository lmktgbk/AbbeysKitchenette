import prisma from "../../../config/prisma.js";

export const revenueAnomaly = {
  id: "revenue_anomaly",
  name: "Revenue Anomaly Detection",
  category: "revenue",
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
        SUM(o."total_amount")::float AS revenue
      FROM orders o
      WHERE o."status" = 'completed'
        AND o."created_at" >= $1
      GROUP BY DATE(o."created_at")
      ORDER BY day ASC
    `, cutoff);

    if (rows.length < 7) return { shouldDetect: false };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const todayRow = rows.find((r) => r.day instanceof Date
      ? r.day.toISOString().split("T")[0] === todayStr
      : String(r.day).split("T")[0] === todayStr);

    const todayRevenue = todayRow ? Number(todayRow.revenue) : 0;
    const historical = rows.filter((r) => {
      const d = r.day instanceof Date ? r.day.toISOString().split("T")[0] : String(r.day).split("T")[0];
      return d !== todayStr;
    }).map((r) => Number(r.revenue));

    return {
      shouldDetect: true,
      todayRevenue,
      historical,
      todayStr,
    };
  },

  condition(data, computeZScore, classifySeverity) {
    const { todayRevenue, historical, todayStr } = data;
    const { zScore, mean, mad } = computeZScore(historical, todayRevenue);

    const config = this.config;
    const severity = classifySeverity(zScore, config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= config.zScoreThresholds.medium;

    const min = Math.max(0, mean - 2 * mad * 1.4826);
    const max = mean + 2 * mad * 1.4826;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dateObj = new Date(todayStr + "T12:00:00");
    const dayName = days[dateObj.getDay()];

    return {
      triggered,
      severity,
      title: `Revenue ${zScore < 0 ? "Drop" : "Spike"} Detected`,
      description: `Yesterday's revenue was ₱${todayRevenue.toLocaleString()} — expected ₱${Math.round(mean).toLocaleString()} (range: ₱${Math.round(min).toLocaleString()} – ₱${Math.round(max).toLocaleString()}). Day: ${dayName}.`,
      actualValue: todayRevenue,
      expectedValue: mean,
      expectedMin: min,
      expectedMax: max,
      confidence,
      dayName,
      trend: historical.slice(-3),
    };
  },

  geminiPrompt(data) {
    const { todayRevenue, mean, dayName, trend } = data;
    const trendStr = trend.map((v) => `₱${Math.round(v)}`).join(", ");
    return `You are an AI advisor for a café called Abbey's Kitchenette.

An anomaly was detected in daily revenue:
- Day: ${dayName}
- Actual revenue: ₱${todayRevenue.toLocaleString()}
- Expected (30-day median): ₱${Math.round(mean).toLocaleString()}
- Recent 3-day revenue trend: ${trendStr}

Provide 2-3 concise, actionable recommendations for the café owner.
Be specific to café operations. Keep response under 100 words.
Format as a numbered list.`;
  },
};
