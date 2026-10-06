import { ai, GEMINI_MODEL } from "../../infrastructure/integrations/gemini.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { wasteReductionRepository as repo } from "./wasteReduction.repository.js";
import { buildWastePrompt } from "./wasteReduction.prompts.js";
import { loadInventoryPlanningSnapshot } from "../../services/inventoryPlanning.repository.js";
import { calculateWaste } from "../../services/inventoryPlanning.js";
import { resolveAdvisory } from "../../services/advisoryEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/**
 * Waste Reduction Service
 *
 * Advisory overstock insights from Gemini (loss history + stock-vs-forecast +
 * restock cadence + costs). Same contract as pricing/reorder: insights never
 * move stock by themselves — accept/reject only flips a status row, and the
 * peso savings shown are deterministic overstock × unit cost, not AI output.
 */

export const wasteReductionService = {
  /** Calculate from a consistent snapshot, optionally explain, then publish atomically. */
  async generate({ automation, signal, userId } = {}) {
    const snapshot = await loadInventoryPlanningSnapshot();
    if (!snapshot.ingredients.length) throw new AppError(400, "No active ingredients found", "NO_INGREDIENTS");
    const insights = calculateWaste(snapshot);
    // Provider output is optional explanatory text. A timeout or malformed reply
    // keeps the verified calculations available and never changes stock intent.
    if (insights.length) {
      try {
        const { system, user } = buildWastePrompt(insights);
        const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: user,
          config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.2,
            abortSignal: signal, httpOptions: { timeout: 15000 } } });
        const parsed = JSON.parse(response.text);
        const explanations = Array.isArray(parsed.explanations) ? parsed.explanations : [];
        for (const item of insights) {
          const explanation = explanations.find(e => e.ingredient_id === item.ingredient_id);
          if (typeof explanation?.explanation === "string" && explanation.explanation.length <= 1000) {
            item.metadata.ai_explanation = explanation.explanation;
          }
        }
      } catch {
        if (signal?.aborted) throw new AppError(503, "Generation was cancelled", "GENERATION_CANCELLED");
        console.warn("[wasteReduction] Explanation unavailable; calculated advice retained");
      }
    }
    await repo.saveInsights(insights, automation, userId);
    return repo.getPendingInsights();
  },

  /**
   * Get all pending waste reduction insights.
   */
  async getPending() {
    return repo.getPendingInsights();
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
