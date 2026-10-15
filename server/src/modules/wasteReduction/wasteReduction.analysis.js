import { createHash } from "node:crypto";
import { calculateWaste } from "../../services/inventoryPlanning.js";

export const WASTE_POLICY_VERSION = 3;

/** Stable facts let actions detect changes without invalidating advice every passing second. */
function fingerprint(snapshot, ingredientId) {
  const facts = { today: snapshot.today, ingredient: snapshot.ingredients.find(i => i.ingredient_id === ingredientId),
    forecast: snapshot.forecast ? { id: snapshot.forecast.id } : null,
    batches: snapshot.batches.filter(b => b.ingredient_id === ingredientId).sort((a, b) => a.batch_id - b.batch_id),
    demand: snapshot.demand.filter(d => d.ingredient_id === ingredientId).sort((a, b) => (a.variant_id ?? 0) - (b.variant_id ?? 0)) };
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

export function buildWasteInsights(snapshot) {
  return calculateWaste(snapshot).map(row => ({ ...row, metadata: { ...row.metadata,
    policy_version: WASTE_POLICY_VERSION, insight_key: `${row.ingredient_id}:${row.metadata.kind}`,
    fingerprint: fingerprint(snapshot, row.ingredient_id) } }));
}

export function wasteStaleness(saved, current) {
  return !current || saved.metadata?.policy_version !== WASTE_POLICY_VERSION || saved.metadata?.fingerprint !== current.metadata.fingerprint
    ? "Inventory or forecast information changed. Generate new insights before taking action." : null;
}
