import { GEMINI_MODEL, ai } from "../../config/gemini.js";

/**
 * General market average prices for milk tea in Lipa City, Batangas.
 * Based on market research across budget, mid-range, and premium segments.
 * Used to compute competitor_avg for reference in suggestions.
 */
const MARKET_AVERAGES = {
  small: 45,
  regular: 75,
  medium: 75,
  large: 105,
  grande: 105,
};

/**
 * Compute market average price for a given size name.
 * @param {string} sizeName - e.g., "Regular", "Large", "Medium", "Small"
 * @returns {number} - market average price
 */
export function getCompetitorAverage(sizeName) {
  const size = sizeName.toLowerCase();
  return MARKET_AVERAGES[size] || MARKET_AVERAGES.regular;
}

function formatMarketContext(variants) {
  const sizes = variants.map(v => v.size_name.toLowerCase());
  const sizeList = variants.map(v => `${v.size_name} (₱${v.price})`).join(', ');
  
  let context = `Market ranges in Lipa City, Batangas:\n`;
  context += `- Small/Regular (350-400ml): ₱35-₱60\n`;
  context += `- Medium (450-500ml): ₱65-₱110\n`;
  context += `- Large/Grande (600-700ml): ₱80-₱140\n`;
  context += `- Premium/specialty (with toppings): ₱100-₱160\n`;
  context += `\nYour product sizes: ${sizeList}`;
  
  return context;
}

function formatVariants(variants) {
  if (!variants.length) return "No variant data available.";
  return variants
    .map(
      (v) =>
        `- [${v.variant_id}] ${v.product_name} (${v.size_name}): Price ₱${v.price}, Cost ₱${v.cost_per_unit}, Margin ${v.margin_percent}%, ${v.total_units_sold} units sold (30d), trend: ${v.trend}`,
    )
    .join("\n");
}

function formatRecipes(recipes) {
  if (!recipes.length) return "No recipe data available.";
  return recipes
    .map(
      (r) =>
        `- [${r.variant_id}] ${r.product_name} (${r.size_name}): ${r.ingredient_name} ${r.quantity_needed} ${r.unit} × ₱${r.cost_per_unit} = ₱${r.line_cost}`,
    )
    .join("\n");
}

/**
 * Build the system prompt for price optimization.
 */
export function buildSystemPrompt() {
  return `You are a pricing optimization expert for a milk tea shop in Lipa City, Batangas, Philippines.

Your task is to analyze product pricing, ingredient costs, sales performance, and market positioning to recommend optimal prices.

MARKET CONTEXT (Lipa City, Batangas, Philippines):
- Budget milk tea shops: ₱35-₱60 per cup
- Mid-range milk tea shops: ₱65-₱110 per cup
- Premium milk tea shops: ₱115-₱160 per cup
- Market average: ₱75-₱105 depending on size
- Target market: Students, young professionals, families
- Currency: Philippine Peso (₱)

ANALYSIS RULES:
1. Consider ingredient cost per unit (COGS) — margin should be 30-35%
2. Consider sales volume — high-volume items can be priced more competitively
3. Consider trend direction — trending up items can sustain slightly higher prices
4. Consider market positioning — price within realistic range for your target segment
5. Recommend round numbers (₱45, ₱55, ₱65, not ₱47.32)
6. Price changes should be modest (±5-15%) unless there's a strong reason
7. Never recommend prices below cost + 25% minimum margin
8. Never recommend prices above ₱160 for regular milk tea (local market cap)
9. For products with negative margins, prioritize reaching break-even first
10. Consider price elasticity — large price jumps may reduce demand

OUTPUT FORMAT (JSON only, no markdown):
{
  "recommendations": [
    {
      "variant_id": "uuid",
      "product_name": "Name",
      "size_name": "Regular",
      "current_price": 85,
      "recommended_price": 95,
      "direction": "increase",
      "change_percent": 11.8,
      "confidence": 0.85,
      "reasoning": "Brief data-driven explanation",
      "margin_before": 61.8,
      "margin_after": 65.3
    }
  ]
}`;
}

/**
 * Build the user prompt with product context.
 */
export function buildUserPrompt(context) {
  const { product, variants, recipes, sales } = context;

  return `Analyze pricing for: ${product.product_name} (Category: ${product.category_name})

## Current Pricing & Costs
${formatVariants(variants)}

## Ingredient Breakdown (per unit)
${formatRecipes(recipes)}

## Market Context (Lipa City, Batangas)
${formatMarketContext(variants)}

## Sales Performance (Last 30 Days)
${sales}

Provide pricing recommendations for each variant. Consider costs, margins, volume, trends, and market positioning. Focus on competitive pricing that balances profitability with market demand.`;
}

/**
 * Generate price optimization suggestions via Gemini.
 * @param {object} context - { product, variants, recipes, sales }
 * @returns {Promise<object>} - parsed JSON recommendations
 */
export async function generatePriceSuggestions(context) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      { role: "user", text: buildUserPrompt(context) },
    ],
    config: {
      systemInstruction: buildSystemPrompt(),
      responseMimeType: "application/json",
    },
  });

  const text = response.text;
  return JSON.parse(text);
}
