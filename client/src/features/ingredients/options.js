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
    if (seen.has(next)) throw new Error("Ingredient pagination did not advance");
    seen.add(next); cursor = next;
  }
  throw new Error("Ingredient catalog exceeds this picker's supported size");
}
