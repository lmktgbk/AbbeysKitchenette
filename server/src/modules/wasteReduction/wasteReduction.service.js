import { AppError } from "../../middleware/errorHandler.middleware.js";
import { wasteReductionRepository as repo } from "./wasteReduction.repository.js";
import { loadInventoryPlanningSnapshot, readInventoryPlanningSnapshot } from "../../services/inventoryPlanning.repository.js";
import { buildWasteInsights, wasteStaleness } from "./wasteReduction.analysis.js";
import { explainWasteInsights } from "./wasteReduction.provider.js";
import { ingredientService } from "../ingredients/ingredient.service.js";
import { resolveAdvisory } from "../../services/advisoryEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import { recordEffects } from "../../infrastructure/effects/effects.js";

/** Recheck insight evidence inside the inventory mutation's ingredient lock. */
async function validateAction(tx, id, batchId, kind, userId) {
  await tx.$queryRaw`SELECT id FROM waste_reductions WHERE id=${id}::uuid FOR UPDATE`;
  const row = await repo.findById(id, tx);
  if (!row) throw new AppError(404, "Waste insight not found", "WASTE_NOT_FOUND");
  if (row.status !== "pending") throw new AppError(409, "Insight was already resolved. Generate new insights", "WASTE_RESOLVED");
  const snapshot = await readInventoryPlanningSnapshot(tx);
  const current = buildWasteInsights(snapshot).find(i => i.ingredient_id === row.ingredientId && i.metadata.kind === row.metadata?.kind);
  if (wasteStaleness(row, current)) throw new AppError(409, "Inventory or forecast information changed. Generate new insights before taking action", "STALE_WASTE_INSIGHT");
  const batch = current.metadata.batches.find(b => b.batch_id === batchId);
  const allowed = kind === "expired" ? current.metadata.kind === "expired_stock" && batch?.expired
    : ["expiry_risk", "expiry_watch"].includes(current.metadata.kind) && batch && !batch.expired;
  if (!allowed || !batch || batch.quantity <= 0) throw new AppError(409, "This batch is not eligible for the requested insight action", "WASTE_BATCH_NOT_ELIGIBLE");
  // This callback runs inside the stock transaction. Resolution rolls back if
  // the actual priority/loss operation fails, and commits with it on success.
  await tx.wasteReduction.update({ where: { id }, data: { status: "accepted" } });
  await recordEffects(tx, { audit: { userId, action: ACTIONS.WASTE_ACCEPTED,
    targetType: "ingredient", targetId: row.ingredientId,
    details: { suggestionId: id, batchId, action: kind === "expired" ? "expired_loss" : "prioritize_batch" } } });
}

async function pendingInsight(id) {
  const row = await repo.findById(id);
  if (!row) throw new AppError(404, "Waste insight not found", "WASTE_NOT_FOUND");
  if (row.status !== "pending") throw new AppError(409, "Insight was already resolved. Generate new insights", "WASTE_RESOLVED");
  return row;
}

export const wasteReductionService = {
  /** Calculate from a consistent snapshot, optionally explain, then publish atomically. */
  async generate({ automation, signal, userId } = {}) {
    const snapshot = await loadInventoryPlanningSnapshot();
    if (!snapshot.ingredients.length) throw new AppError(400, "No active ingredients found", "NO_INGREDIENTS");
    const insights = await explainWasteInsights(buildWasteInsights(snapshot), { signal });
    await repo.saveInsights(insights, automation, userId);
    return this.getPending();
  },

  /**
   * Get all pending waste reduction insights.
   */
  async getPending() {
    const [rows, snapshot] = await Promise.all([repo.getPendingInsights(), loadInventoryPlanningSnapshot()]);
    const current = new Map(buildWasteInsights(snapshot).map(row => [row.metadata.insight_key, row]));
    const order = { expired_stock: 0, expiry_risk: 1, expiry_watch: 2, excess_stock: 3 };
    return rows.filter(row => current.has(`${row.ingredient_id}:${row.metadata?.kind}`))
      .map(row => ({ ...row, stale_reason: wasteStaleness(row, current.get(`${row.ingredient_id}:${row.metadata?.kind}`)) }))
      .sort((a, b) => order[a.metadata.kind] - order[b.metadata.kind]);
  },

  async prioritize(id, batchId, userId) {
    const row = await pendingInsight(id);
    return ingredientService.toggleBatchPriority(row.ingredientId, batchId, true,
      { userId, validate: tx => validateAction(tx, id, batchId, "priority", userId) });
  },

  async expiredLoss(id, batchId, userId) {
    const row = await pendingInsight(id);
    return ingredientService.declareExpiredLoss(row.ingredientId, batchId, userId,
      tx => validateAction(tx, id, batchId, "expired", userId));
  },

  /**
   * Accept a waste reduction insight.
   */
  async accept(id, userId) {
    return resolveAdvisory("wasteReduction", id, "accepted", userId, ACTIONS.WASTE_ACCEPTED);
  },

  async reject(id, userId) {
    return resolveAdvisory("wasteReduction", id, "rejected", userId, ACTIONS.WASTE_REJECTED);
  },
};
