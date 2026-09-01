import repo from "./priceOptimization.repository.js";
import { generatePriceSuggestions, getCompetitorAverage } from "./priceOptimization.prompts.js";

/**
 * Price Optimization Service
 *
 * Orchestrates: gather context → build prompt → call Gemini → parse → save.
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
  async generate(productId) {
    // Step 1: Gather context
    const product = await repo.getProductInfo(productId);
    if (!product) throw new Error("Product not found");

    const variants = await repo.getVariantPricingContext(productId);
    const recipes = await repo.getRecipeDetails(productId);

    // Step 2: Build sales summary string
    const salesLines = variants.map(
      (v) =>
        `- ${v.product_name} (${v.size_name}): ${v.total_units_sold} units, ₱${v.total_revenue} revenue, trend: ${v.trend}`,
    );
    const sales = salesLines.length
      ? salesLines.join("\n")
      : "No sales data in last 30 days.";

    // Step 3: Call Gemini
    const result = await generatePriceSuggestions({
      product: {
        product_name: product.productName,
        category_name: product.category?.categoryName || "Unknown",
      },
      variants: variants.map((v) => ({
        variant_id: v.variant_id,
        product_name: v.product_name,
        size_name: v.size_name,
        price: Number(v.price),
        cost_per_unit: Number(v.cost_per_unit),
        margin_percent: Number(v.margin_percent),
        total_units_sold: v.total_units_sold,
        trend: v.trend,
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

    // Step 4: Save to DB
    if (result.recommendations && result.recommendations.length > 0) {
      const rows = result.recommendations.map((r) => ({
        variantId: Number(r.variant_id),
        productName: r.product_name,
        sizeName: r.size_name,
        currentPrice: r.current_price,
        recommendedPrice: r.recommended_price,
        priceChange: r.recommended_price - r.current_price,
        changePercent: r.change_percent,
        direction: r.direction,
        confidence: r.confidence,
        reasoning: r.reasoning,
        marginBefore: r.margin_before,
        marginAfter: r.margin_after,
        competitorAvg: getCompetitorAverage(r.size_name),
        status: "pending",
      }));

      await repo.saveSuggestions(rows, productId);
    }

    return result.recommendations || [];
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
  async applyPrice(id) {
    const suggestion = await repo.updateStatus(id, "accepted");
    await repo.updateVariantPrice(suggestion.variantId, suggestion.recommendedPrice);
    return suggestion;
  },

  /**
   * Dismiss a suggestion.
   */
  async dismiss(id) {
    return repo.updateStatus(id, "rejected");
  },
};

export default priceOptimizationService;
