import prisma from "../../../config/prisma.js";

export const deadHours = {
  id: "dead_hours",
  name: "Dead Hours Detection",
  category: "sales_hours",
  enabled: true,
  config: { lookbackDays: 30, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  async dataFetcher() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);
    // Day + hour bucketed in Asia/Manila: the DB session tz is UTC, and plain
    // DATE()/EXTRACT() would score Manila 8:00-20:00 trade against UTC slots.
    const rows = await prisma.$queryRawUnsafe(`
      WITH hours AS (
        SELECT DATE(o."created_at" AT TIME ZONE 'Asia/Manila') AS day,
               EXTRACT(HOUR FROM o."created_at" AT TIME ZONE 'Asia/Manila')::int AS hr
        FROM orders o WHERE o."status" = 'completed' AND o."created_at" >= $1
        GROUP BY 1, 2
      ),
      days AS (
        SELECT day, COUNT(DISTINCT hr) FILTER (WHERE hr BETWEEN 8 AND 20)::int AS busy_hours
        FROM hours GROUP BY day
      )
      -- Open window is 8:00-20:00 (13 hourly slots); dead = slots with zero orders.
      SELECT day, (13 - busy_hours)::int AS dead FROM days ORDER BY day ASC
    `, cutoff);
    if (rows.length < 7) return { shouldDetect: false };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toLocaleDateString("en-CA");
    const find = (r) => (r.day instanceof Date ? r.day.toLocaleDateString("en-CA") : String(r.day).split("T")[0]) === todayStr;
    const todayRow = rows.find(find);
    const todayTotal = todayRow ? Number(todayRow.dead) : 0;
    const historical = rows.filter((r) => !find(r)).map((r) => Number(r.dead));
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
      title: "Quiet Hours Detected",
      description: `Today ${todayTotal} dead hours — usually ${Math.round(mean)}.`,
      actualValue: todayTotal, expectedValue: mean,
      expectedMin: Math.max(0, mean - 2 * mad * 1.4826), expectedMax: mean + 2 * mad * 1.4826,
      confidence,
    };
  },
  geminiPrompt(data) {
    return `Dead hours today ${data.todayTotal}. Give 2 short checks for staffing and outages. Under 60 words.`;
  },
};
