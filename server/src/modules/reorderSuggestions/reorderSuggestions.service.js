import { ai, GEMINI_MODEL } from "../../config/gemini.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { reorderSuggestionsRepository as repo } from "./reorderSuggestions.repository.js";
import { buildReorderPrompt } from "./reorderSuggestions.prompts.js";

/**
 * Reorder Suggestions Service
 *
 * Orchestrates context gathering, Gemini API calls, and result storage.
 */

export const reorderSuggestionsService = {
  /**
   * Generate reorder suggestions by gathering context and calling Gemini.
   * 1. Gather inventory context (stock, forecast, usage, suppliers)
   * 2. Build prompt with context
   * 3. Call Gemini API
   * 4. Parse JSON response
   * 5. Store suggestions in DB
   * 6. Return results
   */
  async generate() {
    // Step 1: Gather context
    const [ingredients, demandForecast, usagePatterns, supplierInfo] =
      await Promise.all([
        repo.getIngredientsWithStock(),
        repo.getForecastedDemand(),
        repo.getUsagePatterns(),
        repo.getSupplierInfo(),
      ]);

    if (!ingredients.length) {
      throw new AppError(400, "No active ingredients found", "NO_INGREDIENTS");
    }

    // Step 2: Build prompt
    const { system, user } = buildReorderPrompt({
      ingredients,
      demandForecast,
      usagePatterns,
      supplierInfo,
    });

    // Step 3: Call Gemini
    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });
    } catch (error) {
      console.error("[REORDER_GENERATE] Gemini API error:", error.message);
      throw new AppError(
        503,
        "AI service is temporarily unavailable. Please try again later.",
        "GEMINI_API_ERROR",
      );
    }

    // Step 4: Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(response.text);
    } catch (error) {
      console.error("[REORDER_GENERATE] JSON parse error:", response.text);
      throw new AppError(
        500,
        "Failed to parse AI response",
        "GEMINI_PARSE_ERROR",
      );
    }

    // Step 5: Validate and filter suggestions
    const validIngredientIds = new Set(ingredients.map((i) => i.ingredient_id));
    const suggestions = (parsed.suggestions || []).filter((s) => {
      if (!s.ingredient_id || !validIngredientIds.has(s.ingredient_id)) {
        return false;
      }
      if (typeof s.suggested_quantity !== "number" || s.suggested_quantity <= 0) {
        return false;
      }
      return true;
    });

    // Step 6: Store in DB
    await repo.saveSuggestions(suggestions);

    // Step 7: Return stored results
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
  async accept(id) {
    const suggestion = await repo.updateStatus(id, "accepted");
    return suggestion;
  },

  /**
   * Reject a reorder suggestion.
   */
  async reject(id) {
    const suggestion = await repo.updateStatus(id, "rejected");
    return suggestion;
  },
};
