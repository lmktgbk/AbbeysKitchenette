import { beforeEach, it, expect, vi } from "vitest";
vi.mock("../src/infrastructure/integrations/gemini.js", () => ({ GEMINI_MODEL: "fixture", ai: { models: { generateContent: vi.fn() } } }));
import { ai } from "../src/infrastructure/integrations/gemini.js";
import { generatePriceSuggestions, buildSystemPrompt } from "../src/modules/priceOptimization/priceOptimization.prompts.js";
const context = { product: { product_name: "Coffee", category_name: "Drinks" }, variants: [], recipes: [], sales: "None" };
beforeEach(() => vi.resetAllMocks());
it("uses an integer-ID minimal contract and a bounded cancellable provider request", async () => {
  ai.models.generateContent.mockResolvedValue({ text: '{"recommendations":[]}' });
  await expect(generatePriceSuggestions(context)).resolves.toEqual({ recommendations: [] });
  const config = ai.models.generateContent.mock.calls[0][0].config;
  expect(config.abortSignal).toBeInstanceOf(AbortSignal);
  expect(config.maxOutputTokens).toBe(8192);
  expect(buildSystemPrompt()).toContain('"variant_id": 7');
});
it.each([undefined, "not json", "x".repeat(100001)])("rejects missing, malformed and excessive response text", async text => {
  ai.models.generateContent.mockResolvedValue({ text });
  await expect(generatePriceSuggestions(context)).rejects.toMatchObject({ statusCode: 502 });
});
it.each([["TimeoutError", 504], ["AbortError", 504], ["Error", 502]])("maps %s without exposing provider errors", async (name, statusCode) => {
  ai.models.generateContent.mockRejectedValue(Object.assign(new Error("private provider details"), { name }));
  await expect(generatePriceSuggestions(context)).rejects.toMatchObject({ statusCode });
  await expect(generatePriceSuggestions(context)).rejects.not.toThrow("private provider details");
});
