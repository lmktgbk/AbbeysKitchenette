/**
 * Waste Reduction — Prompt Templates
 *
 * Builds structured prompts for Gemini to generate waste reduction insights.
 */

/**
 * Build the prompt for generating waste reduction insights.
 * @param {object} context
 * @param {Array} context.lossRecords - Recent loss/waste records
 * @param {Array} context.stockVsForecast - Current stock vs forecasted usage
 * @param {Array} context.restockHistory - Recent restock patterns
 * @param {Array} context.ingredientCosts - Ingredient cost data
 * @returns {{ system: string, user: string }}
 */
export function buildWastePrompt(context) {
  const system = `You are a waste reduction analyst for Abbey's Kitchenette, a café.
Your task is to identify over-ordering patterns, waste risks, and suggest improvements.

Rules:
- Focus on ingredients where current stock significantly exceeds forecasted usage
- Identify patterns: over-ordering on certain days, seasonal mismatches, spoilage trends
- Calculate potential savings based on ingredient costs
- waste_risk is "high" if stock exceeds 3x forecasted usage, "medium" if 2-3x, "low" if 1.5-2x
- Be specific in reasoning — reference actual numbers (stock, usage, waste amounts, costs)
- confidence should reflect data quality (0.0 to 1.0)
- Only include ingredients with meaningful overstock (skip minor differences)

Output ONLY a valid JSON object with this structure:
{
  "insights": [
    {
      "ingredient_id": "string (UUID)",
      "ingredient_name": "string",
      "current_stock": number,
      "forecasted_weekly_usage": number,
      "unit": "string",
      "overstock_amount": number,
      "waste_risk": "high" | "medium" | "low",
      "reasoning": "string (detailed explanation with numbers)",
      "suggestion": "string (specific action to take)",
      "potential_savings": number | null,
      "confidence": number
    }
  ]
}

If no significant waste risks found, return { "insights": [] }`;

  const user = `Here is the inventory and waste data:

## Loss Records (Last 30 Days)
${formatLosses(context.lossRecords)}

## Current Stock vs Forecasted Weekly Usage
${formatStockVsForecast(context.stockVsForecast)}

## Recent Restock Patterns (Last 30 Days)
${formatRestockHistory(context.restockHistory)}

## Ingredient Costs
${formatCosts(context.ingredientCosts)}

Analyze this data and identify waste reduction opportunities.`;

  return { system, user };
}

function formatLosses(losses) {
  if (!losses.length) return "No loss records in the last 30 days.";
  return losses
    .map(
      (l) =>
        `- [${l.ingredient_id}] ${l.name}: lost ${l.total_lost} ${l.unit} (${l.loss_count} incidents, type: ${l.primary_type}), ₱${l.total_cost_lost} cost`,
    )
    .join("\n");
}

function formatStockVsForecast(data) {
  if (!data.length) return "No forecast data available.";
  return data
    .map(
      (d) =>
        `- [${d.ingredient_id}] ${d.name}: ${d.stock} ${d.unit} in stock, forecasted ${d.weekly_usage} ${d.unit}/week (${d.days_covered} days covered)`,
    )
    .join("\n");
}

function formatRestockHistory(history) {
  if (!history.length) return "No restock history available.";
  return history
    .map(
      (h) =>
        `- [${h.ingredient_id}] ${h.name}: ordered ${h.total_restocked} ${h.unit} in ${h.restock_count} restocks (avg ${h.avg_per_restock} ${h.unit}/restock)`,
    )
    .join("\n");
}

function formatCosts(costs) {
  if (!costs.length) return "No cost data available.";
  return costs
    .map((c) => `- [${c.ingredient_id}] ${c.name}: ₱${c.cost_per_unit}/${c.unit}`)
    .join("\n");
}
