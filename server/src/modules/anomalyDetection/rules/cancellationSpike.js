import prisma from "../../../config/prisma.js";
import { toManilaDateString, toDayKey } from "../../../config/time.js";

export const cancellationSpike = {
  id: "cancellation_spike",
  name: "Cancellation Rate Spike",
  category: "cancellation",
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
      WITH daily_stats AS (
        SELECT
          DATE(o."created_at" AT TIME ZONE 'Asia/Manila') AS day,
          COUNT(*)::int AS total_orders,
          COUNT(oc."cancellation_id")::int AS cancelled_orders
        FROM orders o
        LEFT JOIN order_cancellations oc ON oc."order_id" = o."order_id"
        WHERE o."created_at" >= $1
        GROUP BY DATE(o."created_at" AT TIME ZONE 'Asia/Manila')
      )
      SELECT
        day,
        total_orders,
        cancelled_orders,
        CASE WHEN total_orders > 0
          THEN (cancelled_orders::float / total_orders * 100)
          ELSE 0
        END AS cancel_rate
      FROM daily_stats
      ORDER BY day ASC
    `, cutoff);

    if (rows.length < 7) return { shouldDetect: false };

    // Manila business "today" — never host-local midnight (see config/time.js).
    const todayStr = toManilaDateString();

    const todayRow = rows.find((r) => toDayKey(r.day) === todayStr);

    const todayRate = todayRow ? Number(todayRow.cancel_rate) : 0;
    const todayTotal = todayRow ? todayRow.total_orders : 0;
    const todayCancelled = todayRow ? todayRow.cancelled_orders : 0;
    const historicalRates = rows.filter((r) => {
      const d = toDayKey(r.day);
      return d !== todayStr && r.total_orders > 0;
    }).map((r) => Number(r.cancel_rate));

    return {
      shouldDetect: true,
      todayRate,
      todayTotal,
      todayCancelled,
      historicalRates,
      todayStr,
    };
  },

  condition(data, computeZScore, classifySeverity) {
    const { todayRate, todayTotal, todayCancelled, historicalRates } = data;

    if (todayTotal < 5) {
      return { triggered: false };
    }

    const { zScore, mean, mad } = computeZScore(historicalRates, todayRate);

    const config = this.config;
    const severity = classifySeverity(zScore, config.zScoreThresholds);
    const triggered = Math.abs(zScore) >= config.zScoreThresholds.medium;

    const min = Math.max(0, mean - 2 * mad * 1.4826);
    const max = mean + 2 * mad * 1.4826;
    const confidence = Math.min(0.99, 0.5 + Math.abs(zScore) * 0.15);

    return {
      triggered,
      severity,
      title: "Cancellation Spike Detected",
      description: `Today's cancellation rate is ${todayRate.toFixed(1)}% (${todayCancelled}/${todayTotal} orders) — average is ${mean.toFixed(1)}%.`,
      actualValue: todayRate,
      expectedValue: mean,
      expectedMin: min,
      expectedMax: max,
      confidence,
    };
  },

  geminiPrompt(data) {
    const { todayRate, todayCancelled, todayTotal, mean } = data;
    return `You are an AI advisor for a café called Abbey's Kitchenette.

An anomaly was detected in order cancellation rate:
- Today's cancellation rate: ${todayRate.toFixed(1)}% (${todayCancelled} of ${todayTotal} orders)
- 30-day average: ${mean.toFixed(1)}%

Provide 2-3 concise, actionable recommendations to investigate and reduce cancellations.
Consider: order accuracy, communication, staffing, menu availability.
Be specific to café operations. Keep response under 100 words.
Format as a numbered list.`;
  },
};
