import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ snapshot: {}, ai: vi.fn(), saveReorder: vi.fn(), saveWaste: vi.fn() }));
vi.mock("../src/services/inventoryPlanning.repository.js", () => ({ loadInventoryPlanningSnapshot: async () => h.snapshot }));
vi.mock("../src/infrastructure/integrations/gemini.js", () => ({ ai: { models: { generateContent: h.ai } }, GEMINI_MODEL: "fixture" }));
vi.mock("../src/services/advisoryEffects.js", () => ({ resolveAdvisory: vi.fn() }));
vi.mock("../src/modules/reorderSuggestions/reorderSuggestions.repository.js", () => ({ reorderSuggestionsRepository: {
  saveSuggestions: h.saveReorder, getPendingSuggestions: async () => h.saveReorder.mock.calls.at(-1)[0],
} }));
vi.mock("../src/modules/wasteReduction/wasteReduction.repository.js", () => ({ wasteReductionRepository: {
  saveInsights: h.saveWaste, getPendingInsights: async () => h.saveWaste.mock.calls.at(-1)[0],
} }));
import { reorderSuggestionsService } from "../src/modules/reorderSuggestions/reorderSuggestions.service.js";
import { wasteReductionService } from "../src/modules/wasteReduction/wasteReduction.service.js";
beforeEach(() => {
  vi.clearAllMocks();
  h.snapshot = { today: "2026-10-06", forecast: null, ingredients: [{ ingredient_id: "milk", ingredient_name: "Milk", unit: "ml", minimum_threshold: 100 }],
    demand: [], batches: [{ ingredient_id: "milk", batch_id: 1, quantity_left: 10, cost_per_unit: 1,
      expiry_date: "2026-10-05", is_priority: false, restocked_at: "2026-09-01" }] };
});
describe("Optional AI explanation contract", () => {
  it("keeps purchases and expired-stock advice available when the provider fails", async () => {
    h.ai.mockRejectedValue(new Error("fixture timeout"));
    expect((await reorderSuggestionsService.generate())[0].suggested_quantity).toBe(100);
    expect((await wasteReductionService.generate())[0].metadata.expired_quantity).toBe(10);
  });
  it("does not trust provider quantities, stock or money", async () => {
    h.ai.mockResolvedValue({ text: JSON.stringify({ explanations: [{ ingredient_id: "milk", explanation: "Check supplier availability", suggested_quantity: 99999, potential_savings: 99999 }] }) });
    const [result] = await reorderSuggestionsService.generate();
    expect(result.suggested_quantity).toBe(100);
    expect(result.metadata.ai_explanation).toBe("Check supplier availability");
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
});
