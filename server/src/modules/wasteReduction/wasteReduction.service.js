import { ai, GEMINI_MODEL } from "../../config/gemini.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { wasteReductionRepository as repo } from "./wasteReduction.repository.js";
import { buildWastePrompt } from "./wasteReduction.prompts.js";

/**
 * Waste Reduction Service
 *
 * Orchestrates context gathering, Gemini API calls, and result storage.
 */

export const wasteReductionService = {
  /**
   * Generate waste reduction insights by gathering context and calling Gemini.
   */
  async generate() {
    // Step 1: Gather context
    const [lossRecords, stockVsForecast, restockHistory, ingredientCosts] =
      await Promise.all([
        repo.getLossRecords(),
        repo.getStockVsForecast(),
        repo.getRestockHistory(),
        repo.getIngredientCosts(),
      ]);

    if (!stockVsForecast.length) {
      throw new AppError(
        400,
        "No forecast data available. Run a demand forecast first.",
        "NO_FORECAST_DATA",
      );
    }

    // Step 2: Build prompt
    const { system, user } = buildWastePrompt({
      lossRecords,
      stockVsForecast,
      restockHistory,
      ingredientCosts,
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
      console.error("[WASTE_GENERATE] Gemini API error:", error.message);
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
      console.error("[WASTE_GENERATE] JSON parse error:", response.text);
      throw new AppError(
        500,
        "Failed to parse AI response",
        "GEMINI_PARSE_ERROR",
      );
    }

    // Step 5: Validate and filter insights
    const validIngredientIds = new Set(
      stockVsForecast.map((i) => i.ingredient_id),
    );
    const insights = (parsed.insights || []).filter((i) => {
      if (!i.ingredient_id || !validIngredientIds.has(i.ingredient_id)) {
        return false;
      }
      if (typeof i.overstock_amount !== "number" || i.overstock_amount <= 0) {
        return false;
      }
      return true;
    });

    // Step 6: Store in DB
    await repo.saveInsights(insights);

    // Step 7: Return stored results
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
  async accept(id) {
    return repo.updateStatus(id, "accepted");
  },

  /**
   * Reject a waste reduction insight.
   */
  async reject(id) {
    return repo.updateStatus(id, "rejected");
  },
};
