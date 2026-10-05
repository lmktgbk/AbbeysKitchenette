import { ai, GEMINI_MODEL } from "../../config/gemini.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { reorderSuggestionsRepository as repo } from "./reorderSuggestions.repository.js";
import { buildReorderPrompt } from "./reorderSuggestions.prompts.js";
import { resolveAdvisory } from "../../services/advisoryEffects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";

/**
 * Round suggested quantity to nice order increments based on unit.
 */
function roundToNiceQty(qty, unit) {
  if (!qty || qty <= 0) return qty;
  const u = (unit || "").toLowerCase();
  // Preserve the configured increments in the ingredient's stored unit; this is not unit conversion.
  if (["ml", "l", "g", "kg"].includes(u)) return Math.ceil(qty / 50) * 50;
  if (u === "pcs" || u === "pieces") return Math.ceil(qty / 10) * 10;
  return Math.ceil(qty / 5) * 5;
}

/**
 * Reorder Suggestions Service
 *
 * Advisory restock quantities from Gemini (stock + forecast + usage +
 * suppliers). Suggestions never order anything by themselves —
 * accept/reject only flips a status row; purchasing happens outside the
 * system. Expiry-aware: FEFO buckets keep soon-to-expire stock out of the
 * suggested quantities.
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
  async generate({ automation, signal, userId } = {}) {
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

    // Provider latency stays outside the publication transaction so no database
    // lock is held during generation. The worker can cancel through signal.
    let response;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: user,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          temperature: 0.3,
          abortSignal: signal,
          httpOptions: { timeout: 120000 },
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
    } catch {
      console.warn("[REORDER_GENERATE] Invalid provider JSON");
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

    // Supplement ingredients omitted by the provider using the existing deficit
    // policy. Provider-selected quantities remain advisory and are not overwritten.
    const LEAD_TIME_DAYS = 2;

    const costMap = new Map(
      supplierInfo
        .filter((s) => s.cost_per_unit != null)
        .map((s) => [s.ingredient_id, { cost: Number(s.cost_per_unit), supplier: s.supplier }]),
    );

    const geminiIds = new Set(suggestions.map((s) => s.ingredient_id));
    for (const ing of ingredients) {
      if (geminiIds.has(ing.ingredient_id)) continue;

      const fresh = Number(ing.stock_fresh ?? ing.stock);
      const expiring = Number(ing.stock_expiring_7d ?? 0);
      const demandDeficit = ing.total_forecast > 0 && fresh < ing.total_forecast;
      const belowThreshold = ing.minimum_threshold > 0 && fresh < ing.minimum_threshold;

      if (!demandDeficit && !belowThreshold) continue;

      // Urgency: lead-time-aware on fresh stock (zero fresh with need = high)
      const daysOut = ing.days_until_stockout;
      let urgency = "low";
      if (fresh <= 0 && (demandDeficit || belowThreshold)) urgency = "high";
      else if (daysOut != null) {
        if (daysOut <= LEAD_TIME_DAYS) urgency = "high";
        else if (daysOut <= LEAD_TIME_DAYS + 3) urgency = "medium";
      }

      // Quantity: deficit on fresh × 1.2 buffer, minus usable expiring, rounded
      const usableExpiring = Math.min(expiring, Number(ing.total_forecast) || 0);
      const rawQty = demandDeficit
        ? Math.max(0, ing.total_forecast - fresh - usableExpiring * 0.5) * 1.2
        : Math.max(0, ing.minimum_threshold - fresh) * 1.2;
      const suggestedQty = roundToNiceQty(rawQty, ing.unit);

      // Trigger type in reasoning (use fresh stock, not total)
      const triggers = [];
      if (belowThreshold) triggers.push(`below minimum threshold (fresh ${fresh} ${ing.unit} < ${ing.minimum_threshold} ${ing.unit})`);
      if (demandDeficit) triggers.push(`fresh stock insufficient for forecast (fresh ${fresh} ${ing.unit} < ${ing.total_forecast} ${ing.unit} needed${expiring > 0 ? `, ${expiring} ${ing.unit} expiring in 7d usable first` : ""})`);
      const triggerLabel = triggers.join(" and ");

      // Estimated cost
      const { cost } = costMap.get(ing.ingredient_id) || {};
      const costLine = cost != null
        ? ` Estimated cost: ₱${(suggestedQty * cost).toFixed(2)} (${cost}/${ing.unit} × ${suggestedQty}).`
        : "";

      suggestions.push({
        ingredient_id: ing.ingredient_id,
        ingredient_name: ing.ingredient_name,
        current_stock: ing.stock,
        unit: ing.unit,
        suggested_quantity: suggestedQty,
        urgency,
        reasoning: `Triggered: ${triggerLabel}. Days until stockout: ${daysOut ?? "unknown"}.${costLine} Suggested order includes 20% safety buffer.`,
        estimated_stockout: null,
        confidence: 0.85,
      });
    }

    // Step 6: Store in DB
    await repo.saveSuggestions(suggestions, automation, userId);

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
  async accept(id, userId) {
    return resolveAdvisory("reorderSuggestion", id, "accepted", userId, ACTIONS.REORDER_ACCEPTED);
  },

  async reject(id, userId) {
    return resolveAdvisory("reorderSuggestion", id, "rejected", userId, ACTIONS.REORDER_REJECTED);
  },
};
