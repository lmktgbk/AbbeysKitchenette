import { ai, GEMINI_MODEL } from "../../config/gemini.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { wasteReductionRepository as repo } from "./wasteReduction.repository.js";
import { buildWastePrompt } from "./wasteReduction.prompts.js";
import { auditLogService } from "../auditLogs/auditLog.service.js";
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

    // Step 5: Validate and fix numbers ourselves (don't trust AI math)
    const stockMap = new Map(stockVsForecast.map((s) => [s.ingredient_id, s]));
    const costMap = new Map((ingredientCosts || []).map((c) => [c.ingredient_id, Number(c.cost_per_unit) || 0]));
    const validIngredientIds = new Set(stockMap.keys());
    const insights = (parsed.insights || []).filter((i) => {
      if (!i.ingredient_id || !validIngredientIds.has(i.ingredient_id)) return false;
      if (typeof i.overstock_amount !== "number" || i.overstock_amount <= 0) return false;
      return true;
    }).map((i) => {
      const ctx = stockMap.get(i.ingredient_id) || {};
      const fresh = Number(ctx.stock_fresh ?? ctx.stock ?? 0);
      const weekly = Number(ctx.weekly_usage ?? i.forecasted_weekly_usage ?? 0);
      const expiring = Number(ctx.stock_expiring_7d ?? 0);
      const cost = costMap.get(i.ingredient_id) || 0;
      // Deterministic overstock: fresh minus weekly need (floor 0), rounded
      const trueOverstock = weekly > 0 ? Math.max(0, Math.round((fresh - weekly) * 100) / 100) : Math.max(0, fresh);
      // Savings must match overstock * cost (cap at true exposure)
      const trueSavings = cost > 0 ? Math.round(trueOverstock * cost * 100) / 100 : null;
      // Keep AI reasoning/suggestion but fix numbers
      return {
        ...i,
        overstock_amount: trueOverstock,
        forecasted_weekly_usage: weekly,
        potential_savings: trueSavings,
        reasoning: `${Number(expiring) > 0 ? `${expiring} ${ctx.unit || i.unit || ""} expiring within 7 days. ` : ""}Fresh stock ${fresh} vs weekly need ${weekly}. ${i.reasoning || ""}`.trim(),
      };
    }).filter((i) => i.overstock_amount > 0 || Number(stockMap.get(i.ingredient_id)?.stock_expiring_7d ?? 0) > 0);

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
  async accept(id, userId) {
    const pending = await repo.getPendingInsights();
    const found = pending.find((i) => String(i.id) === String(id));
    const insight = await repo.updateStatus(id, "accepted");
    auditLogService.logAction({
      userId,
      action: ACTIONS.WASTE_ACCEPTED,
      targetType: "ingredient",
      targetId: found?.ingredient_id ?? null,
      details: { name: found?.ingredient_name ?? null },
    }).catch(() => {});
    return insight;
  },

  /**
   * Reject a waste reduction insight.
   */
  async reject(id, userId) {
    const pending = await repo.getPendingInsights();
    const found = pending.find((i) => String(i.id) === String(id));
    const insight = await repo.updateStatus(id, "rejected");
    auditLogService.logAction({
      userId,
      action: ACTIONS.WASTE_REJECTED,
      targetType: "ingredient",
      targetId: found?.ingredient_id ?? null,
      details: { name: found?.ingredient_name ?? null },
    }).catch(() => {});
    return insight;
  },
};
