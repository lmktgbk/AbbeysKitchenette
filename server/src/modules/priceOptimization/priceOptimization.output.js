import { z } from "zod";
import { integerId, money, LIMITS } from "../../utils/validation.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

export const PRICE_POLICY_VERSION = 3;
// Market ranges describe uncertain model estimates, not sourced competitor quotes.
const marketEstimate = z.object({
  low: money(true), high: money(true),
}).strict().refine(value => value.low <= value.high, "Market range is reversed");

const recommendation = z.object({
  variant_id: integerId,
  recommended_price: money(true),
  confidence: z.number().finite().min(0).max(1),
  reasoning: z.string().trim().min(1).max(2000),
  market_estimate: marketEstimate.nullable(),
}).strict();
const output = z.object({ recommendations: z.array(recommendation).min(1).max(LIMITS.variants) }).strict();
const invalid = () => new AppError(502, "AI returned invalid recommendations. Existing suggestions were preserved", "INVALID_PRICE_RECOMMENDATIONS");
const round = value => Math.round(value * 100) / 100;

/** Validate provider output and bind each unique variant to observed pricing before publication. */
export function normalizeRecommendations(result, variants) {
  const parsed = output.safeParse(result);
  if (!parsed.success || parsed.data.recommendations.length !== variants.length) throw invalid();
  const allowed = new Map(variants.map(v => [v.variant_id, v]));
  const seen = new Set();
  return parsed.data.recommendations.map(r => {
    const v = allowed.get(r.variant_id);
    // Reject the entire response on a foreign or repeated variant; partial
    // replacement could otherwise hide valid existing pending recommendations.
    if (!v || seen.has(r.variant_id)) throw invalid();
    seen.add(r.variant_id);
    const currentPrice = Number(v.price);
    const cost = Number(v.cost_per_unit);
    if (!money(true).safeParse(currentPrice).success || !Number.isFinite(cost) || cost < 0) {
      throw new AppError(409, "Product pricing context is invalid", "INVALID_PRICING_CONTEXT");
    }
    if (v.missing_costs > 0 || v.recipe_count === 0) {
      throw new AppError(409, "Complete recipe and ingredient cost records before optimizing prices", "PRICING_COSTS_MISSING");
    }
    // Percentage changes are unrestricted; ingredient cost remains the hard floor.
    if (r.recommended_price < cost) {
      throw new AppError(502, "Recommendation violates the ingredient cost floor", "UNSAFE_PRICE_RECOMMENDATION");
    }
    // Derive financial metadata from the database snapshot, never from model arithmetic.
    const delta = (Math.round(r.recommended_price * 100) - Math.round(currentPrice * 100)) / 100;
    return {
      variantId: v.variant_id, productName: v.product_name, sizeName: v.size_name,
      currentPrice, recommendedPrice: r.recommended_price, priceChange: delta,
      changePercent: round(delta / currentPrice * 100),
      direction: delta > 0 ? "increase" : delta < 0 ? "decrease" : "keep",
      confidence: r.confidence, reasoning: r.reasoning,
      marginBefore: round((currentPrice - cost) / currentPrice * 100),
      marginAfter: round((r.recommended_price - cost) / r.recommended_price * 100),
      status: "pending",
      policyVersion: PRICE_POLICY_VERSION,
      pricingContext: { marketEstimate: r.market_estimate ? { ...r.market_estimate,
        label: "AI-estimated Lipa SME market range", verified: false, generatedAt: new Date().toISOString() } : null },
    };
  });
}
