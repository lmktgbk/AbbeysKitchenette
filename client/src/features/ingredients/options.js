/**
 * Collects the complete recipe-picker catalog through bounded cursor pages.
 * fetchPage receives the query’s AbortSignal; any failed page rejects the whole load.
 * The returned envelope matches the ingredient query consumers, sorted by name.
 */
export async function loadIngredientOptions(fetchPage, signal) {
  const ingredients = [];
  let cursor;
  const seen = new Set();
  // Preserve the previous picker's capacity without one oversized request or silent truncation.
  for (let page = 0; page < 100; page++) {
    const response = await fetchPage({ cursor, signal });
    ingredients.push(...response.data.ingredients);
    const next = response.data.next_cursor;
    if (!next) return { data: { ingredients: ingredients.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name)) } };
    // A repeated cursor would revisit pages; fail rather than returning duplicated or incomplete options.
    if (seen.has(next)) throw new Error("Ingredient pagination did not advance");
    seen.add(next); cursor = next;
  }
  // Hitting the safety bound is an error, not a successful but silently truncated catalog.
  throw new Error("Ingredient catalog exceeds this picker's supported size");
}
