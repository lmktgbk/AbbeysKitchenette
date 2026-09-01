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
 * @param {Array} context.demandForecast - Forecasted ingredient needs (next 7 days)
 * @param {Array} context.usagePatterns - Recent stock deduction patterns
 * @param {Array} context.supplierInfo - Recent supplier data from restock batches
 * @returns {{ system: string, user: string }}
 */
export function buildReorderPrompt(context) {
  const system = `You are an inventory advisor for Abbey's Kitchenette, a café.
Your task is to analyze current stock levels, forecasted demand, and historical usage patterns
to recommend what ingredients need to be reordered, how much, and when.

Rules:
- Only recommend ingredients that actually need reordering (stock below or near threshold, or will run out before next likely restock)
- Urgency is "high" if stock will run out within 2 days, "medium" if 3-5 days, "low" if 5-7 days
- Consider lead time (assume 1-2 days for most suppliers)
- suggested_quantity should cover at least 7 days of forecasted demand plus a safety buffer
- Be specific in reasoning — reference actual numbers (current stock, daily usage, days remaining)
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

## Forecasted Ingredient Demand (Next 7 Days)
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
      (i) =>
        `- [${i.ingredient_id}] ${i.ingredient_name}: ${i.stock} ${i.unit} (min threshold: ${i.minimum_threshold} ${i.unit})`,
    )
    .join("\n");
}

function formatDemand(demand) {
  if (!demand.length) return "No forecast data available.";
  return demand
    .map(
      (d) =>
        `- [${d.ingredient_id}] ${d.name}: ${d.daily_avg} ${d.unit}/day avg, ${d.total_7day} ${d.unit} total over 7 days`,
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
    .map((s) => `- [${s.ingredient_id}] ${s.name}: last supplier "${s.supplier}", ${s.restock_count} recent restocks`)
    .join("\n");
}
