import { recordEffects } from "../../infrastructure/effects/effects.js";
import { ACTIONS } from "../auditLogs/auditLog.constants.js";
import repo from "./priceOptimization.repository.js";
import { normalizeRecommendations } from "./priceOptimization.output.js";
import { generatePriceSuggestions } from "./priceOptimization.prompts.js";
import { getMarketContext } from "./priceOptimization.market.js";
import prisma from "../../config/prisma.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/** Resolve once; accepting also updates the observed variant price and saves its audit in the same commit. */
async function resolveSuggestion(id, status, userId) {
  return prisma.$transaction(async tx => {
    const suggestion = await repo.findById(id, tx);
    if (!suggestion) throw new AppError(404, "Price suggestion not found", "PRICE_SUGGESTION_NOT_FOUND");
    const updatedAt = new Date();
    const claimed = await repo.claimPending(id, status, tx, updatedAt);
    if (!claimed.count) throw new AppError(409, "Suggestion was already resolved. Refresh before trying again", "PRICE_SUGGESTION_CONFLICT");
    if (status === "accepted") {
      if (suggestion.policyVersion !== 2) throw new AppError(409, "This suggestion uses outdated pricing assumptions. Regenerate before applying", "PRICE_POLICY_OUTDATED");
      const price = Number(suggestion.recommendedPrice);
      if (!Number.isFinite(price) || price <= 0 || price > 99999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) {
        throw new AppError(400, "Recommended price must be positive and fit two decimal places", "INVALID_RECOMMENDED_PRICE");
      }
      if (price < Number(suggestion.currentPrice) * 0.9 || price > Number(suggestion.currentPrice) * 1.1) {
        throw new AppError(409, "Recommendation exceeds the 10% price change limit. Regenerate before applying", "UNSAFE_PRICE_RECOMMENDATION");
      }
      // Compare the observed price and availability before writing. A stale
      // recommendation rolls back its status claim instead of replacing a newer price.
      const changed = await repo.updateVariantPrice(suggestion.variantId, suggestion.currentPrice, suggestion.recommendedPrice, tx);
      if (changed !== 1) throw new AppError(409, "Product price or availability changed. Refresh and generate a new suggestion", "STALE_PRICE_SUGGESTION");
    }
    await recordEffects(tx, { audit: { userId,
      action: status === "accepted" ? ACTIONS.PRICE_APPLIED : ACTIONS.PRICE_DISMISSED,
      targetType: "variant", targetId: String(suggestion.variantId),
      details: { name: suggestion.productName, sizeName: suggestion.sizeName,
        current_price: Number(suggestion.currentPrice), recommended_price: Number(suggestion.recommendedPrice) } } });
    return { ...suggestion, status, updatedAt };
  }, { timeout: 5000 });
}

/**
 * Price Optimization Service
 *
 * Orchestrates: gather context → build prompt → call Gemini → parse → save.
 * Suggestions are advisory only and land as pending rows — applying a price
 * changes the sale price, so applying one requires an explicit admin action.
 * Resolution claims and price writes share a short database transaction.
 */
const priceOptimizationService = {
  /**
   * Generate price suggestions for a product.
   * 1. Fetch variant pricing context
   * 2. Fetch recipe details
   * 3. Build sales summary
   * 4. Call Gemini
   * 5. Save suggestions to DB
   */
  async generate(productId, userId) {
    // Step 1: Gather context
    const product = await repo.getProductInfo(productId);
    if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    if (product.isArchived) throw new AppError(409, "Archived products cannot receive recommendations", "PRODUCT_ARCHIVED");

    const [variants, recipes] = await Promise.all([
      repo.getVariantPricingContext(productId), repo.getRecipeDetails(productId),
    ]);
    if (!variants.length || variants.length > 50) throw new AppError(409, "Product must have between 1 and 50 variants", "INVALID_PRICING_CONTEXT");
    // Stop before menu/provider calls when the recipe cannot support a cost floor.
    if (variants.some(v => v.missing_costs > 0 || v.recipe_count === 0)) {
      throw new AppError(409, "Complete recipe and ingredient cost records before optimizing prices", "PRICING_COSTS_MISSING");
    }
    if (variants.some(v => Number(v.cost_per_unit) > Number(v.price) * 1.1)) {
      throw new AppError(409, "Ingredient cost exceeds the permitted 10% price change. Manual pricing review required", "PRICING_REVIEW_REQUIRED");
    }
    const productContext = { product_id: productId, product_name: product.productName,
      description: product.description || null,
      category_name: product.subcategory?.category?.categoryName || null,
      subcategory_name: product.subcategory?.subcategoryName || null };
    const market = await getMarketContext(productContext, variants);

    // Step 2: Build sales summary string
    const salesLines = variants.map(
      (v) =>
        `- ${v.product_name} (${v.size_name}): ${v.total_units_sold} units, ₱${v.total_revenue} revenue, trend: ${v.trend || "unavailable"}`,
    );
    const sales = salesLines.length
      ? salesLines.join("\n")
      : "No sales data in last 30 days.";

    // Step 3: Call Gemini
    const result = await generatePriceSuggestions({
      product: productContext,
      market,
      variants: variants.map((v) => ({
        variant_id: v.variant_id,
        product_name: v.product_name,
        size_name: v.size_name,
        price: Number(v.price),
        cost_per_unit: Number(v.cost_per_unit),
        margin_percent: Number(v.margin_percent),
        total_units_sold: v.total_units_sold,
        trend: v.trend,
        forecast: v.trend ? { generated_at: v.forecast_completed_at,
          period: v.forecast_period, daily_data: v.forecast_daily_data } : { status: "unavailable" },
      })),
      recipes: recipes.map((r) => ({
        variant_id: r.variant_id,
        product_name: r.product_name,
        size_name: r.size_name,
        ingredient_name: r.ingredient_name,
        quantity_needed: Number(r.quantity_needed),
        unit: r.unit,
        cost_per_unit: Number(r.cost_per_unit),
        line_cost: Number(r.line_cost),
      })),
      sales,
    });

    const observedVariants = new Map(variants.map(v => [v.variant_id, v]));
    // Persist the evidence used at generation; later reads must not silently
    // substitute new forecasts/costs underneath an existing recommendation.
    const rows = normalizeRecommendations(result, variants).map(row => {
      const observed = observedVariants.get(row.variantId);
      return { ...row, competitorAvg: null,
        pricingContext: { product: productContext,
          market: market.variants[String(row.variantId)], marketNote: market.note,
          ingredientCost: Number(observed.cost_per_unit),
          sales: { units: Number(observed.total_units_sold || 0), revenue: Number(observed.total_revenue || 0), days: 30 },
          forecastAvailable: Boolean(observed.trend),
          forecast: observed.trend ? { trend: observed.trend,
            generatedAt: new Date(observed.forecast_completed_at).toISOString(),
            dailyData: observed.forecast_daily_data, period: observed.forecast_period } : null },
      };
    });
    await repo.saveSuggestions(rows, productId, userId);
    return rows.map(row => ({
      variant_id: row.variantId, product_name: row.productName, size_name: row.sizeName,
      current_price: row.currentPrice, recommended_price: row.recommendedPrice,
      price_change: row.priceChange, change_percent: row.changePercent, direction: row.direction,
      confidence: row.confidence, reasoning: row.reasoning,
      margin_before: row.marginBefore, margin_after: row.marginAfter,
    }));
  },

  /**
   * Get pending suggestions for a product.
   */
  async getPending(productId) {
    return repo.getPendingSuggestions(productId);
  },

  /**
   * Apply recommended price: update variant + mark suggestion accepted.
   */
  async applyPrice(id, userId) {
    return resolveSuggestion(id, "accepted", userId);
  },

  /**
   * Dismiss a suggestion.
   */
  async dismiss(id, userId) {
    return resolveSuggestion(id, "rejected", userId);
  },
};

export default priceOptimizationService;
