import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ingredientPlan,
  simulateBatches,
} from "../../services/inventoryPlanning.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

export const REORDER_POLICY_VERSION = 2;
export const REORDER_CHUNK_SIZE = 20;
const round = (n) => Math.round(n * 1000) / 1000;
const quantity = z
  .number()
  .finite()
  .min(0)
  .max(9999999.999)
  .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.000001);
const responseSchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            ingredient_id: z.string(),
            unit: z.string(),
            suggested_quantity: quantity,
            urgency: z.enum(["high", "medium", "low"]),
            reason: z.string().trim().min(1).max(1500),
          })
          .strict(),
      )
      .max(REORDER_CHUNK_SIZE),
  })
  .strict();

/** Facts are calculated here; purchase quantities belong to Gemini, not a hidden formula. */
export function buildReorderContexts(snapshot) {
  return snapshot.ingredients.map((ingredient) => {
    const plan = ingredientPlan(snapshot, ingredient, { requireFresh: false });
    const usage = snapshot.usage?.find(
      (u) => u.ingredient_id === ingredient.ingredient_id,
    );
    const context = {
      ingredient_id: ingredient.ingredient_id,
      ingredient_name: ingredient.ingredient_name,
      unit: ingredient.unit,
      minimum_stock: Number(ingredient.minimum_threshold),
      as_of: snapshot.today,
      horizon_days: 7,
      forecast_id: snapshot.forecast?.id ?? null,
      forecast_generated_at: snapshot.forecast?.generated_at ?? null,
      forecast_complete: plan.complete,
      forecast_issues: plan.issues,
      expected_use: round(plan.demand),
      daily_expected_use: plan.daily,
      expected_use_available: snapshot.demand.some(
        (d) =>
          d.ingredient_id === ingredient.ingredient_id &&
          !d.skipped &&
          Array.isArray(d.daily_data) &&
          d.daily_data.some(
            (day) =>
              day.date in plan.daily &&
              typeof day.units === "number" &&
              Number.isFinite(day.units) &&
              day.units >= 0,
          ),
      ),
      usable_stock: round(plan.usableStock),
      expired_stock: round(plan.totalStock - plan.usableStock),
      estimated_unused_at_expiry: plan.complete
        ? round(plan.expiringUnused)
        : null,
      first_shortage: plan.complete
        ? (plan.unmet.find((d) => d.quantity > 1e-9)?.date ?? null)
        : null,
      recent_daily_usage: Number(usage?.daily_average ?? 0),
      recent_usage_days: 14,
      batches: plan.batches
        .map((b) => ({
          batch_id: b.batch_id,
          remaining: Number(b.quantity_left),
          expires: b.expiry_date,
          priority: Boolean(b.is_priority),
          received: b.restocked_at,
        }))
        .sort((a, b) => a.batch_id - b.batch_id),
      recipes: snapshot.demand
        .filter((d) => d.ingredient_id === ingredient.ingredient_id)
        .map((d) => ({
          variant_id: d.variant_id,
          quantity_needed: Number(d.quantity_needed),
          skipped: d.skipped,
        }))
        .sort((a, b) => a.variant_id - b.variant_id),
    };
    return {
      ...context,
      fingerprint: createHash("sha256")
        .update(JSON.stringify(context))
        .digest("hex"),
    };
  });
}

/** Select purchasing concerns, not every catalog ingredient. This never chooses a purchase quantity. */
export function reorderReviewReasons(context) {
  const reasons = [];
  const { usable_stock: stock, minimum_stock: minimum } = context;
  if (stock <= 0) reasons.push("Out of usable stock");
  else if (stock < minimum) reasons.push("Below minimum stock");
  if (context.expected_use_available && context.expected_use > stock)
    reasons.push("Predicted consumption exceeds usable stock");

  const dates = Object.keys(context.daily_expected_use).sort();
  const batches = context.batches.map((b) => ({
    batch_id: b.batch_id,
    quantity_left: b.remaining,
    expiry_date: b.expires,
    is_priority: b.priority,
    restocked_at: b.received,
  }));
  const recentDemand = Object.fromEntries(
    dates.map((date) => [date, context.recent_daily_usage]),
  );
  const projected = simulateBatches(
    batches,
    context.daily_expected_use,
    context.as_of,
  );
  const recent = simulateBatches(batches, recentDemand, context.as_of);
  const soon = context.batches.filter(
    (b) => b.expires && b.expires >= context.as_of && b.expires < dates.at(-1),
  );
  const afterExpiry = stock - soon.reduce((sum, b) => sum + b.remaining, 0);
  if (
    soon.length &&
    (afterExpiry < minimum ||
      (context.expected_use_available &&
        projected.unmet.some((d) => d.quantity > 1e-9)) ||
      (!context.forecast_complete &&
        context.recent_daily_usage > 0 &&
        recent.unmet.some((d) => d.quantity > 1e-9)))
  ) {
    reasons.push("Upcoming expiry could leave a shortage");
  }
  if (
    !context.forecast_complete &&
    context.recent_daily_usage > 0 &&
    recent.unmet.some((d) => d.quantity > 1e-9)
  ) {
    reasons.push(
      "Incomplete forecast; recent consumption indicates a shortage",
    );
  }
  return reasons;
}

export function selectReorderCandidates(contexts) {
  return contexts.flatMap((context) => {
    const review_reasons = reorderReviewReasons(context);
    return review_reasons.length ? [{ ...context, review_reasons }] : [];
  });
}

/** Reject an entire incomplete/foreign response; never publish a partial replacement. */
export function normalizeReorders(result, contexts) {
  const parsed = responseSchema.safeParse(result);
  const invalid = (reason, fields = []) => {
    const error = new AppError(
      502,
      "AI returned invalid restock advice. Previous suggestions were preserved",
      "INVALID_REORDER_ADVICE",
    );
    error.diagnostic = { reason, fields };
    return error;
  };
  if (!parsed.success)
    throw invalid(
      "schema",
      parsed.error.issues.slice(0, 6).map((i) => i.path.join(".")),
    );
  if (parsed.data.recommendations.length !== contexts.length)
    throw invalid("ingredient_count");
  const allowed = new Map(contexts.map((c) => [c.ingredient_id, c]));
  const seen = new Set();
  return parsed.data.recommendations.map((r) => {
    const c = allowed.get(r.ingredient_id);
    if (!c || seen.has(r.ingredient_id))
      throw invalid("foreign_or_duplicate_ingredient");
    if (r.unit !== c.unit) throw invalid("unit_mismatch");
    if (
      ["pcs", "pieces"].includes(c.unit.toLowerCase()) &&
      !Number.isInteger(r.suggested_quantity)
    )
      throw invalid("fractional_pieces");
    seen.add(r.ingredient_id);
    const warnings = [...c.forecast_issues];
    if (c.usable_stock + r.suggested_quantity < c.minimum_stock)
      warnings.push("Recommendation leaves stock below the minimum threshold");
    if (c.forecast_complete) {
      const effectiveStock = c.usable_stock - c.estimated_unused_at_expiry;
      if (effectiveStock + r.suggested_quantity < c.expected_use)
        warnings.push(
          "Recommendation may not cover seven-day demand; review purchase timing",
        );
      if (
        r.suggested_quantity > 0 &&
        effectiveStock + r.suggested_quantity >
          Math.max(c.expected_use, c.minimum_stock) * 1.5
      )
        warnings.push(
          "Recommended stock exceeds 150% of expected use or minimum stock; review before purchasing",
        );
    }
    return {
      ingredient_id: c.ingredient_id,
      current_stock: c.usable_stock,
      unit: c.unit,
      suggested_quantity: r.suggested_quantity,
      urgency: r.suggested_quantity === 0 ? "low" : r.urgency,
      reasoning: r.reason,
      estimated_stockout: c.first_shortage,
      confidence: c.forecast_complete ? 0.8 : 0.4,
      metadata: {
        policy_version: REORDER_POLICY_VERSION,
        source: "gemini",
        ...c,
        warnings,
      },
    };
  });
}

export function reorderStaleness(suggestion, context) {
  if (
    !context ||
    suggestion.metadata?.policy_version !== REORDER_POLICY_VERSION ||
    suggestion.metadata?.fingerprint !== context.fingerprint
  ) {
    return "Stock, recipes, forecast, or planning date changed. Generate new suggestions.";
  }
  return null;
}
