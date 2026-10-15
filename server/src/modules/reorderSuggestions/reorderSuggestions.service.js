import { AppError } from "../../middleware/errorHandler.middleware.js";
import { reorderSuggestionsRepository as repo } from "./reorderSuggestions.repository.js";
import { loadInventoryPlanningSnapshot } from "../../services/inventoryPlanning.repository.js";
import { buildReorderContexts, selectReorderCandidates, reorderStaleness, REORDER_CHUNK_SIZE } from "./reorderSuggestions.analysis.js";
import { generateReorderChunk } from "./reorderSuggestions.provider.js";
import { resolveAdvisory } from "../../services/advisoryEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/** Gemini chooses quantities; validated facts and stale checks remain backend-owned. */
const GENERATION_TIMEOUT_MS = 180000;

/** Shared by publication and read-only checks: never sends two ingredient groups concurrently. */
export async function generateReorderBatches(contexts, { signal } = {}) {
  const deadline = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const suggestions = [];
  try {
    for (let i = 0; i < contexts.length; i += REORDER_CHUNK_SIZE) {
      requestSignal.throwIfAborted();
      const chunk = contexts.slice(i, i + REORDER_CHUNK_SIZE);
      suggestions.push(...await generateReorderChunk(chunk, { signal: requestSignal }));
    }
    requestSignal.throwIfAborted();
    return suggestions;
  } catch (error) {
    if (signal?.aborted) throw new AppError(503, "Generation was cancelled", "GENERATION_CANCELLED");
    if (requestSignal.aborted) throw new AppError(504, "Gemini generation timed out. Previous suggestions were preserved. Please try again", "REORDER_AI_TIMEOUT");
    if (error instanceof AppError) throw error;
    throw new AppError(502, "AI restock recommendations could not be generated. Previous suggestions were preserved. Please try again", "REORDER_AI_UNAVAILABLE");
  }
}

export const reorderSuggestionsService = {
  /** Recommend from a consistent snapshot, validate every ingredient, then publish atomically. */
  async generate({ automation, signal, userId } = {}) {
    const snapshot = await loadInventoryPlanningSnapshot();
    if (!snapshot.ingredients.length) throw new AppError(400, "No active ingredients found", "NO_INGREDIENTS");
    const contexts = selectReorderCandidates(buildReorderContexts(snapshot));
    const suggestions = await generateReorderBatches(contexts, { signal });
    await repo.saveSuggestions(suggestions.filter(s => s.suggested_quantity > 0), automation, userId);
    return this.getPending();
  },

  /**
   * Get all pending reorder suggestions.
   */
  async getPending() {
    const [rows, snapshot] = await Promise.all([repo.getPendingSuggestions(), loadInventoryPlanningSnapshot()]);
    const contexts = new Map(selectReorderCandidates(buildReorderContexts(snapshot)).map(c => [c.ingredient_id, c]));
    return rows.filter(row => Number(row.suggested_quantity) > 0 && contexts.has(row.ingredient_id))
      .map(row => ({ ...row, stale_reason: reorderStaleness(row, contexts.get(row.ingredient_id)) }));
  },

  /**
   * Accept a reorder suggestion.
   */
  async accept(id, userId) {
    return repo.acceptCurrent(id, userId);
  },

  async reject(id, userId) {
    return resolveAdvisory("reorderSuggestion", id, "rejected", userId, ACTIONS.REORDER_REJECTED);
  },
};
