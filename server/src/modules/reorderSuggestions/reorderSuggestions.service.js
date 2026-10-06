import { ai, GEMINI_MODEL } from "../../infrastructure/integrations/gemini.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { reorderSuggestionsRepository as repo } from "./reorderSuggestions.repository.js";
import { buildReorderPrompt } from "./reorderSuggestions.prompts.js";
import { loadInventoryPlanningSnapshot } from "../../services/inventoryPlanning.repository.js";
import { calculateReorders } from "../../services/inventoryPlanning.js";
import { resolveAdvisory } from "../../services/advisoryEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/** Deterministic purchase quantities with optional AI explanations; writes only advisory rows. */

export const reorderSuggestionsService = {
  /** Calculate from a consistent snapshot, optionally explain, then publish atomically. */
  async generate({ automation, signal, userId } = {}) {
    const snapshot = await loadInventoryPlanningSnapshot();
    if (!snapshot.ingredients.length) throw new AppError(400, "No active ingredients found", "NO_INGREDIENTS");
    const suggestions = calculateReorders(snapshot);
    // Provider output is optional explanatory text. A timeout or malformed reply
    // keeps the verified calculations available and never changes stock intent.
    if (suggestions.length) {
      try {
        const { system, user } = buildReorderPrompt(suggestions);
        const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: user,
          config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.2,
            abortSignal: signal, httpOptions: { timeout: 15000 } } });
        const parsed = JSON.parse(response.text);
        const explanations = Array.isArray(parsed.explanations) ? parsed.explanations : [];
        for (const item of suggestions) {
          const explanation = explanations.find(e => e.ingredient_id === item.ingredient_id);
          if (typeof explanation?.explanation === "string" && explanation.explanation.length <= 1000) {
            item.metadata.ai_explanation = explanation.explanation;
          }
        }
      } catch {
        if (signal?.aborted) throw new AppError(503, "Generation was cancelled", "GENERATION_CANCELLED");
        console.warn("[reorderSuggestions] Explanation unavailable; calculated advice retained");
      }
    }
    await repo.saveSuggestions(suggestions, automation, userId);
    return repo.getPendingSuggestions();
  },

  /**
   * Get all pending reorder suggestions.
   */
  async getPending() {
    return repo.getPendingSuggestions();
  },

  /**
   * Accept a reorder suggestion.
   */
  async accept(id, userId) {
    return resolveAdvisory("reorderSuggestion", id, "accepted", userId, ACTIONS.REORDER_ACCEPTED);
  },

  async reject(id, userId) {
    return resolveAdvisory("reorderSuggestion", id, "rejected", userId, ACTIONS.REORDER_REJECTED);
  },
};
