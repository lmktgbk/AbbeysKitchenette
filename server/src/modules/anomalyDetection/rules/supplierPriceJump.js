import prisma from "../../../config/prisma.js";

export const supplierPriceJump = {
  id: "supplier_price_jump",
  name: "Supplier Price Jump Detection",
  category: "supplier",
  // Disabled per owner cut — low signal. Re-enable to restore.
  enabled: false,
  config: { lookbackDays: 90, zScoreThresholds: { medium: 2.0, high: 2.5, critical: 3.0 } },
  async dataFetcher() {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT i."ingredient_id", i."ingredient_name" AS name, i."unit",
        (SELECT rb2."cost_per_unit"::float FROM restock_batches rb2 WHERE rb2."ingredient_id" = i."ingredient_id" AND rb2."quantity_left" >= 0 ORDER BY rb2."restocked_at" DESC LIMIT 1) AS latest,
        (SELECT AVG(rb3."cost_per_unit")::float FROM restock_batches rb3 WHERE rb3."ingredient_id" = i."ingredient_id" AND rb3."restocked_at" >= NOW() - INTERVAL '90 days') AS avgcost
      FROM ingredients i WHERE i."is_archived" = false
    `);
    let worst = null;
    for (const r of rows) {
      const latest = Number(r.latest), avg = Number(r.avgcost);
      if (!latest || !avg || avg <= 0) continue;
      const jump = (latest - avg) / avg;
      if (jump >= 0.3 && (!worst || jump > worst.jump)) worst = { ...r, latest, avg, jump };
    }
    if (!worst) return { shouldDetect: false };
    return { shouldDetect: true, worst, todayStr: new Date().toLocaleDateString("en-CA") };
  },
  condition() {
    const { worst } = this._lastData || {};
    return { triggered: false };
  },
  async evaluateOverride(computeZScore, classifySeverity) {
    const data = await this.dataFetcher();
    if (!data.shouldDetect) return null;
    const { worst } = data;
    const pct = Math.round(worst.jump * 100);
    const severity = pct >= 80 ? "critical" : pct >= 50 ? "high" : "medium";
    return {
      triggered: true, severity,
      title: "Supplier Price Up Detected",
      description: `${worst.name} now ₱${worst.latest}/g — usually ₱${worst.avg.toFixed(2)} (+${pct}%).`,
      actualValue: worst.latest, expectedValue: worst.avg,
      expectedMin: worst.avg, expectedMax: worst.avg,
      confidence: 0.85,
      ingredientId: worst.ingredient_id, ingredientName: worst.name, latestCost: worst.latest,
    };
  },
};
