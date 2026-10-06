/** Explain backend-calculated advice; the provider does not set quantities, risk or money. */
export function buildWastePrompt(items) {
  return { system: `Explain these inventory recommendations briefly in plain language. Preserve the supplied facts.
Do not introduce new quantities, prices, supplier claims, savings guarantees or risk scores.
Return JSON {"explanations":[{"ingredient_id":"UUID","explanation":"text"}]}.`,
    user: JSON.stringify(items.map(i => ({ ingredient_id: i.ingredient_id, ingredient: i.ingredient_name,
      unit: i.unit, reasoning: i.reasoning, context: i.metadata }))) };
}
