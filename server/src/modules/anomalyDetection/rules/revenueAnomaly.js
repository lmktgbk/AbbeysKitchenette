import prisma from "../../../config/prisma.js";
import { toManilaDateString, toDayKey, manilaDayStart } from "../../../config/time.js";

export const revenueAnomaly = {
  id: "revenue_anomaly",
  name: "Revenue Anomaly Detection",
  category: "revenue",
  enabled: true,

  config: {
    lookbackDays: 30,
    zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 },
  },

  /** Compare the prior Manila calendar day with earlier observed full days, never today's running total. */
  async dataFetcher() {
    const end = manilaDayStart(toManilaDateString());
    const targetDate = new Date(end.getTime() - 86400000);
    const todayStr = toManilaDateString(targetDate);
    const cutoff = new Date(end.getTime() - 31 * 86400000);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        DATE(o."created_at" AT TIME ZONE 'Asia/Manila') AS day,
        SUM(o."total_amount")::float AS revenue
      FROM orders o
      WHERE o."status" = 'completed'
        AND o."created_at" >= $1
        AND o."created_at" < $2
      GROUP BY DATE(o."created_at" AT TIME ZONE 'Asia/Manila')
      ORDER BY day ASC
    `, cutoff, end);

    if (rows.length < 7) return { shouldDetect: false };

    const todayRow = rows.find((r) => toDayKey(r.day) === todayStr);
    // No orders cannot distinguish a closure or missing records from zero demand.
    if (!todayRow) return { shouldDetect: false };
    const todayRevenue = Number(todayRow.revenue);
    const historical = rows.filter((r) => {
      const d = toDayKey(r.day);
      return d < todayStr;
    }).map((r) => Number(r.revenue));

    return {
      shouldDetect: historical.length >= 7,
      todayRevenue,
      historical,
      todayStr,
    };
  },

  /** Score completed-order revenue in either direction and derive the display weekday from the business date. */
  condition(data, computeZScore, classifySeverity) {
    const { todayRevenue, historical, todayStr } = data;
    const { zScore, mean, mad } = computeZScore(historical, todayRevenue);

    const config = this.config;
    const severity = classifySeverity(zScore, config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= config.zScoreThresholds.medium;

    // Display bands use the arithmetic mean returned by the engine; scoring
    // itself is centered on a median. Keep these existing policies distinct.
    const min = Math.max(0, mean - 2 * mad * 1.4826);
    const max = mean + 2 * mad * 1.4826;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    // Weekday of the Manila business date via UTC math — host-tz independent.
    const [ry, rm, rd] = todayStr.split("-").map(Number);
    const dayName = days[new Date(Date.UTC(ry, rm - 1, rd, 12)).getUTCDay()];

    return {
      triggered,
      severity,
      title: `Revenue ${zScore < 0 ? "Drop" : "Spike"} Detected`,
      description: `Recorded revenue for ${todayStr} was ₱${todayRevenue.toLocaleString()} — historical daily average ₱${Math.round(mean).toLocaleString()} (range: ₱${Math.round(min).toLocaleString()} – ₱${Math.round(max).toLocaleString()}). Day: ${dayName}.`,
      actualValue: todayRevenue,
      expectedValue: mean,
      expectedMin: min,
      expectedMax: max,
      confidence,
      dayName,
      trend: historical.slice(-3),
    };
  },

  /** Provide business-date, revenue expectation, and recent trend context for optional owner advice. */
  geminiPrompt(data) {
    const { todayRevenue, mean, dayName, trend, todayStr } = data;
    const trendStr = trend.map((v) => `₱${Math.round(v)}`).join(", ");
    return `You are an AI advisor for a café called Abbey's Kitchenette.

An anomaly was detected in daily revenue:
- Day: ${dayName}
- Business date: ${todayStr}
- Actual revenue: ₱${todayRevenue.toLocaleString()}
- Historical daily average (observed dates in the last 30 days): ₱${Math.round(mean).toLocaleString()}
- The assessed date is a completed Manila calendar day; it excludes today's running sales. Recorded totals do not prove records are complete.
- Recent 3-day revenue trend: ${trendStr}

Provide 2-3 concise, actionable recommendations for the café owner.
Be specific to café operations. Keep response under 100 words.
Format as a numbered list.`;
  },
};
