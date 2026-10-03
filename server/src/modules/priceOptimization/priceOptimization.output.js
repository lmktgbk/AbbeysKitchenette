import { z } from "zod";
import { integerId, money, LIMITS } from "../../utils/validation.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

const recommendation = z.object({
  variant_id: integerId,
  recommended_price: money(true),
  confidence: z.number().finite().min(0).max(1),
  reasoning: z.string().trim().min(1).max(2000),
}).strict();
const output = z.object({ recommendations: z.array(recommendation).min(1).max(LIMITS.variants) }).strict();
const invalid = () => new AppError(502, "AI returned invalid recommendations. Existing suggestions were preserved", "INVALID_PRICE_RECOMMENDATIONS");
const round = value => Math.round(value * 100) / 100;

export function normalizeRecommendations(result, variants) {
  const parsed = output.safeParse(result);
  if (!parsed.success) throw invalid();
  const allowed = new Map(variants.map(v => [v.variant_id, v]));
  const seen = new Set();
  return parsed.data.recommendations.map(r => {
    const v = allowed.get(r.variant_id);
    if (!v || seen.has(r.variant_id)) throw invalid();
    seen.add(r.variant_id);
    const currentPrice = Number(v.price);
    const cost = Number(v.cost_per_unit);
    if (!money(true).safeParse(currentPrice).success || !Number.isFinite(cost) || cost < 0) {
      throw new AppError(409, "Product pricing context is invalid", "INVALID_PRICING_CONTEXT");
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
    };
  });
}
