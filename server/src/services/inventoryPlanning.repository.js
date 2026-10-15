import prisma from "../config/prisma.js";
import { MANILA_TODAY_SQL } from "../config/time.js";

/**
 * One short, repeatable-read snapshot for both advice features. All ingredient
 * and batch inputs are fetched in sets; no per-ingredient database requests.
 * External AI calls run only after this transaction has released its snapshot.
 */
export async function loadInventoryPlanningSnapshot(client = prisma, options = {}) {
  return client.$transaction(tx => readInventoryPlanningSnapshot(tx, options), { isolationLevel: "RepeatableRead", timeout: 10000 });
}

/** Also usable inside the acceptance transaction after locking the ingredient. */
export async function readInventoryPlanningSnapshot(tx, { jobId } = {}) {
    const [clock] = await tx.$queryRawUnsafe(`SELECT ${MANILA_TODAY_SQL}::text AS today`);
    const forecast = await tx.$queryRawUnsafe(`SELECT id, completed_at::text AS generated_at, EXTRACT(EPOCH FROM (now() - completed_at))/3600 AS age_hours
      FROM forecast_jobs WHERE status='completed' ${jobId != null ? "AND id=$1" : ""} ORDER BY completed_at DESC, id DESC LIMIT 1`, ...(jobId != null ? [jobId] : []));
    const ingredients = await tx.$queryRawUnsafe(`SELECT ingredient_id, ingredient_name, unit, minimum_threshold::float
      FROM ingredients WHERE is_archived=false ORDER BY ingredient_name`);
    const batches = await tx.$queryRawUnsafe(`SELECT rb.restock_id AS batch_id, rb.ingredient_id, rb.version, rb.quantity_left::float,
      rb.cost_per_unit::float, rb.is_priority, rb.restocked_at::text, rb.expiry_date::text
      FROM restock_batches rb JOIN ingredients i USING (ingredient_id)
      WHERE rb.quantity_left>0 AND i.is_archived=false`);
    // Left join preserves variants without usable predictions so uncertainty cannot become zero demand.
    const demand = await tx.$queryRawUnsafe(`SELECT r.ingredient_id, r.variant_id, r.quantity_needed::float,
      fr.daily_data, COALESCE(fr.skipped, true) AS skipped
      FROM recipes r JOIN product_variants pv USING (variant_id) JOIN products p USING (product_id)
      LEFT JOIN forecast_results fr ON fr.variant_id=r.variant_id AND fr.job_id=$1
      WHERE p.is_archived=false ORDER BY r.ingredient_id, r.variant_id`, forecast[0]?.id ?? -1);
    const usage = await tx.$queryRawUnsafe(`SELECT ingredient_id,
      (-SUM(LEAST(quantity_changed, 0)))::float AS total_14day,
      (-SUM(LEAST(quantity_changed, 0))/14)::float AS daily_average
      FROM stock_adjustments WHERE adjustment_type='deduction'
      AND adjusted_at >= ((${MANILA_TODAY_SQL} - 14)::timestamp AT TIME ZONE 'Asia/Manila')
      AND adjusted_at < (${MANILA_TODAY_SQL}::timestamp AT TIME ZONE 'Asia/Manila')
      GROUP BY ingredient_id`);
    const missingRecipes = forecast.length ? await tx.$queryRawUnsafe(`SELECT fr.variant_id, fr.daily_data
      FROM forecast_results fr JOIN product_variants pv ON pv.variant_id=fr.variant_id JOIN products p ON p.product_id=pv.product_id
      WHERE fr.job_id=$1 AND fr.skipped=false AND p.is_archived=false
      AND NOT EXISTS (SELECT 1 FROM recipes r JOIN ingredients i USING (ingredient_id)
        WHERE r.variant_id=fr.variant_id AND i.is_archived=false)`, forecast[0].id) : [];
    return { usage, today: clock.today, forecast: forecast[0] ?? null, ingredients, batches, demand,
      recipeMissingVariants: missingRecipes.filter(r => Array.isArray(r.daily_data) && r.daily_data.some(d => d.units > 0)).map(r => r.variant_id) };
}
