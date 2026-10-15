import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ snapshot: {}, pending: null, ai: vi.fn(), saveReorder: vi.fn(), saveWaste: vi.fn() }));
vi.mock("../src/services/inventoryPlanning.repository.js", () => ({ loadInventoryPlanningSnapshot: async () => h.snapshot }));
vi.mock("../src/infrastructure/integrations/gemini.js", () => ({ ai: { models: { generateContent: h.ai } }, GEMINI_MODEL: "fixture" }));
vi.mock("../src/services/advisoryEffects.js", () => ({ resolveAdvisory: vi.fn() }));
vi.mock("../src/modules/reorderSuggestions/reorderSuggestions.repository.js", () => ({ reorderSuggestionsRepository: {
  saveSuggestions: h.saveReorder, getPendingSuggestions: async () => h.pending ?? h.saveReorder.mock.calls.at(-1)?.[0] ?? [],
} }));
vi.mock("../src/modules/wasteReduction/wasteReduction.repository.js", () => ({ wasteReductionRepository: {
  saveInsights: h.saveWaste, getPendingInsights: async () => h.saveWaste.mock.calls.at(-1)[0],
} }));
import { reorderSuggestionsService } from "../src/modules/reorderSuggestions/reorderSuggestions.service.js";
import { wasteReductionService } from "../src/modules/wasteReduction/wasteReduction.service.js";
beforeEach(() => {
  vi.clearAllMocks();
  h.pending = null;
  h.snapshot = { today: "2026-10-06", forecast: null, ingredients: [{ ingredient_id: "milk", ingredient_name: "Milk", unit: "ml", minimum_threshold: 100 }],
    demand: [], batches: [{ ingredient_id: "milk", batch_id: 1, quantity_left: 10, cost_per_unit: 1,
      expiry_date: "2026-10-05", is_priority: false, restocked_at: "2026-09-01" }] };
});
describe("AI purchasing and optional waste explanations", () => {
  it("does not call Gemini when every ingredient is healthy", async () => {
    h.snapshot.batches[0].quantity_left = 1500; h.snapshot.batches[0].expiry_date = null;
    expect(await reorderSuggestionsService.generate()).toEqual([]);
    expect(h.ai).not.toHaveBeenCalled();
    expect(h.saveReorder).toHaveBeenCalledWith([], undefined, undefined);
  });
  it("does not save or show zero-purchase recommendations", async () => {
    h.ai.mockResolvedValue({ text: JSON.stringify({ recommendations: [{ ingredient_id: "milk", unit: "ml", suggested_quantity: 0, urgency: "low", reason: "No purchase justified; review recorded activity." }] }) });
    expect(await reorderSuggestionsService.generate()).toEqual([]);
    expect(h.saveReorder.mock.calls[0][0]).toEqual([]);
  });
  it("sends only ingredients needing review, excluding healthy stock from the prompt", async () => {
    h.snapshot.ingredients.push({ ingredient_id: "vegetables", ingredient_name: "Frozen vegetables", unit: "g", minimum_threshold: 500 });
    h.snapshot.batches.push({ ingredient_id: "vegetables", batch_id: 2, quantity_left: 1500, expiry_date: null });
    h.ai.mockResolvedValue({ text: JSON.stringify({ recommendations: [{ ingredient_id: "milk", unit: "ml", suggested_quantity: 100, urgency: "high", reason: "Below minimum stock." }] }) });
    expect(await reorderSuggestionsService.generate()).toHaveLength(1);
    const sent = JSON.parse(h.ai.mock.calls[0][0].contents);
    expect(sent.map(c => c.ingredient_id)).toEqual(["milk"]);
    expect(sent[0].review_reasons).toContain("Out of usable stock");
  });
  it("hides previously saved zero-purchase and now-healthy advice without regeneration", async () => {
    h.snapshot.ingredients.push({ ingredient_id: "vegetables", ingredient_name: "Frozen vegetables", unit: "g", minimum_threshold: 500 });
    h.snapshot.batches.push({ ingredient_id: "vegetables", batch_id: 2, quantity_left: 1500, expiry_date: null });
    h.pending = [{ ingredient_id: "milk", suggested_quantity: 0 }, { ingredient_id: "vegetables", suggested_quantity: 100 }];
    expect(await reorderSuggestionsService.getPending()).toEqual([]);
  });
  it("preserves previous purchasing advice on provider failure while waste advice remains available", async () => {
    h.ai.mockRejectedValue(new Error("fixture timeout"));
    await expect(reorderSuggestionsService.generate()).rejects.toMatchObject({ code: "REORDER_AI_UNAVAILABLE" });
    expect(h.saveReorder).not.toHaveBeenCalled();
    expect((await wasteReductionService.generate())[0].metadata.expired_quantity).toBe(10);
  });
  it("uses Gemini's quantity and reason while retaining verified stock and incomplete-forecast warnings", async () => {
    h.ai.mockResolvedValue({ text: JSON.stringify({ recommendations: [{ ingredient_id: "milk", unit: "ml", suggested_quantity: 250, urgency: "high", reason: "Forecast unavailable; purchase based on minimum stock and review soon." }] }) });
    const [result] = await reorderSuggestionsService.generate();
    expect(result.suggested_quantity).toBe(250);
    expect(result.reasoning).toContain("Forecast unavailable");
    expect(result.metadata.source).toBe("gemini");
    expect(result.metadata.warnings).toContain("No completed forecast available");
    expect(result.current_stock).toBe(0);
  });
  it("does not publish advice from a cancelled generation", async () => {
    h.ai.mockRejectedValue(new Error("fixture cancelled"));
    await expect(reorderSuggestionsService.generate({ signal: { aborted: true } })).rejects.toMatchObject({ code: "GENERATION_CANCELLED" });
    expect(h.saveReorder).not.toHaveBeenCalled();
  });
  it("retains calculated advice after malformed JSON", async () => {
    h.ai.mockResolvedValue({ text: "not JSON" });
    expect((await wasteReductionService.generate())[0].potential_savings).toBeNull();
  });
  it.each(["not JSON", JSON.stringify({ recommendations: [] }), JSON.stringify({ recommendations: [{ ingredient_id: "foreign", unit: "ml", suggested_quantity: 250, urgency: "high", reason: "Invalid" }] })])("does not replace existing recommendations with invalid output", async text => {
    h.ai.mockResolvedValue({ text });
    await expect(reorderSuggestionsService.generate()).rejects.toThrow();
    expect(h.saveReorder).not.toHaveBeenCalled();
  });
  it("preserves the previous generation when one ingredient chunk fails", async () => {
    h.snapshot.ingredients = Array.from({ length: 31 }, (_, i) => ({ ingredient_id: `ingredient-${i}`, ingredient_name: `Ingredient ${i}`, unit: "g", minimum_threshold: 10 }));
    h.ai.mockImplementation(async ({ contents }) => {
      const contexts = JSON.parse(contents);
      if (contexts.length < 20) throw new Error("Second chunk unavailable");
      return { text: JSON.stringify({ recommendations: contexts.map(c => ({ ingredient_id: c.ingredient_id, unit: c.unit, suggested_quantity: 20, urgency: "medium", reason: "Minimum-stock purchase; forecast unavailable." })) }) };
    });
    await expect(reorderSuggestionsService.generate()).rejects.toMatchObject({ code: "REORDER_AI_UNAVAILABLE" });
    expect(h.ai).toHaveBeenCalledTimes(2);
    expect(h.saveReorder).not.toHaveBeenCalled();
  });
  it("processes the complete catalog one group at a time and publishes only the combined result", async () => {
    h.snapshot.ingredients = Array.from({ length: 41 }, (_, i) => ({ ingredient_id: `ingredient-${i}`, ingredient_name: `Ingredient ${i}`, unit: "g", minimum_threshold: 10 }));
    let active = 0, peak = 0;
    h.ai.mockImplementation(async ({ contents }) => {
      active++; peak = Math.max(peak, active);
      await Promise.resolve();
      const contexts = JSON.parse(contents);
      active--;
      return { text: JSON.stringify({ recommendations: contexts.map(c => ({ ingredient_id: c.ingredient_id, unit: c.unit, suggested_quantity: 20, urgency: "medium", reason: "Review recorded usage and minimum stock." })) }) };
    });
    const rows = await reorderSuggestionsService.generate();
    expect(rows).toHaveLength(41);
    expect(h.ai.mock.calls.map(([request]) => JSON.parse(request.contents).length)).toEqual([20, 20, 1]);
    expect(peak).toBe(1);
    expect(h.saveReorder).toHaveBeenCalledTimes(1);
    expect(h.saveReorder.mock.calls[0][0]).toHaveLength(41);
  });
  it("stops before later groups when the first group fails", async () => {
    h.snapshot.ingredients = Array.from({ length: 41 }, (_, i) => ({ ingredient_id: `ingredient-${i}`, ingredient_name: `Ingredient ${i}`, unit: "g", minimum_threshold: 10 }));
    h.ai.mockRejectedValue(new Error("Provider unavailable"));
    await expect(reorderSuggestionsService.generate()).rejects.toMatchObject({ code: "REORDER_AI_UNAVAILABLE" });
    expect(h.ai).toHaveBeenCalledTimes(1);
    expect(h.saveReorder).not.toHaveBeenCalled();
  });
});
