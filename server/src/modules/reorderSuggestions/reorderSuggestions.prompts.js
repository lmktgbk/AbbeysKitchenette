/**
 * Reorder Suggestions — Prompt Templates
 *
 * Builds structured prompts for Gemini to generate reorder recommendations.
 * Each function takes context data and returns { system, user } strings.
 */

/**
 * Build the prompt for generating reorder suggestions.
 * @param {object} context
 * @param {Array} context.ingredients - Active ingredients with stock levels
 * @param {Array} context.demandForecast - Forecasted ingredient needs (full forecast period)
 * @param {Array} context.usagePatterns - Recent stock deduction patterns
 * @param {Array} context.supplierInfo - Recent supplier data from restock batches
 * @returns {{ system: string, user: string }}
 */
export function buildReorderPrompt(context) {
  const today = new Date().toISOString().split("T")[0];
  const system = `You are an inventory advisor for Abbey's Kitchenette, a café.
Today's date is ${today}.
Your task is to analyze current stock levels, forecasted demand, and historical usage patterns
to recommend what ingredients need to be reordered, how much, and when.

Rules:
- Only recommend ingredients that actually need reordering (fresh stock below or near threshold, or will run out before next likely restock)
- Use fresh stock (good for more than 7 days) for coverage, not total stock. Expired stock counts as zero.
- If stock includes expiring within 7 days, prefer using it first and order less. Mention e.g. "500g expiring in 4 days, order 200g less" in reasoning.
- Urgency is "high" if fresh stock will run out within 2 days (supplier lead time), "medium" if 3-5 days, "low" if 5-7 days
- Consider lead time (assume 1-2 days for most suppliers)
- suggested_quantity should cover the full forecast period of demand plus a safety buffer, minus usable expiring stock
- Be specific in reasoning — reference actual numbers (fresh stock, expiring amount, daily usage, days remaining)
- confidence should reflect how reliable the data is (0.0 to 1.0)

Output ONLY a valid JSON object with this structure:
{
  "suggestions": [
    {
      "ingredient_id": "string (UUID)",
      "ingredient_name": "string",
      "current_stock": number,
      "unit": "string",
      "suggested_quantity": number,
      "urgency": "high" | "medium" | "low",
      "reasoning": "string (detailed explanation with numbers)",
      "estimated_stockout": "YYYY-MM-DD" | null,
      "confidence": number
    }
  ]
}

If no ingredients need reordering, return { "suggestions": [] }`;

  const user = `Here is the current inventory data:

## Current Stock Levels
${formatIngredients(context.ingredients)}

## Forecasted Ingredient Demand (Full Forecast Period)
${formatDemand(context.demandForecast)}

## Recent Usage Patterns (Last 14 Days)
${formatUsage(context.usagePatterns)}

## Supplier Information
${formatSuppliers(context.supplierInfo)}

Analyze this data and recommend which ingredients need reordering.`;

  return { system, user };
}

function formatIngredients(ingredients) {
  if (!ingredients.length) return "No ingredient data available.";
  return ingredients
    .map(
      (i) => {
        const stockout = i.days_until_stockout != null ? `${i.days_until_stockout} days` : "unknown";
        const fresh = i.stock_fresh ?? i.stock;
        const deficit = i.total_forecast > 0 ? fresh - i.total_forecast : 0;
        const deficitLabel = deficit < 0 ? `DEFICIT: ${Math.abs(deficit)} ${i.unit} short of forecast need` : "fresh stock covers forecast need";
        const expiry = `fresh: ${fresh} ${i.unit}, expiring in 7d: ${i.stock_expiring_7d ?? 0} ${i.unit}, expired: ${i.stock_expired ?? 0} ${i.unit}`;
        return `- [${i.ingredient_id}] ${i.ingredient_name}: ${i.stock} ${i.unit} in stock (${expiry}) (min threshold: ${i.minimum_threshold} ${i.unit}), daily usage: ${i.daily_avg} ${i.unit}/day, forecast period need: ${i.total_forecast} ${i.unit}, days until stockout: ${stockout}, ${deficitLabel}`;
      },
    )
    .join("\n");
}

function formatDemand(demand) {
  if (!demand.length) return "No forecast data available.";
  return demand
    .map(
      (d) =>
        `- [${d.ingredient_id}] ${d.name}: ${d.daily_avg} ${d.unit}/day avg, ${d.total_forecast} ${d.unit} total over forecast period`,
    )
    .join("\n");
}

function formatUsage(patterns) {
  if (!patterns.length) return "No usage data available.";
  return patterns
    .map(
      (p) =>
        `- [${p.ingredient_id}] ${p.name}: avg ${p.avg_daily} ${p.unit}/day, consumed ${p.total_14day} ${p.unit} in last 14 days`,
    )
    .join("\n");
}

function formatSuppliers(suppliers) {
  if (!suppliers.length) return "No supplier data available.";
  return suppliers
    .map((s) => {
      const cost = s.cost_per_unit != null ? ` (₱${s.cost_per_unit}/${s.unit || "unit"})` : "";
      return `- [${s.ingredient_id}] ${s.name}: last supplier "${s.supplier}"${cost}`;
    })
    .join("\n");
}
