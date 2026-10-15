import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("../src/infrastructure/integrations/gemini.js", () => ({ GEMINI_MODEL: "fixture", ai: { models: { generateContent: vi.fn() } } }));
import { ai } from "../src/infrastructure/integrations/gemini.js";
import { explainWasteInsights } from "../src/modules/wasteReduction/wasteReduction.provider.js";
const row = (kind = "expiry_risk", key = "milk") => ({ ingredient_name: "Milk", unit: "ml", suggestion: "Standard recommendation",
  overstock_amount: 5, metadata: { kind, insight_key: key, at_risk_quantity: 5 } });
const response = (keys = ["milk"]) => ({ text: JSON.stringify({ recommendations: keys.map(insight_key => ({ insight_key, recommendation: "Review safe use and reduce upcoming purchases." })) }) });
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());
it("uses Gemini recommendations without changing calculated quantities", async () => {
  ai.models.generateContent.mockResolvedValue(response());
  const input = row(); const [result] = await explainWasteInsights([input]);
  expect(result.suggestion).toContain("Review safe use");
  expect(result.overstock_amount).toBe(5);
  expect(input.suggestion).toBe("Standard recommendation");
  expect(result.metadata.recommendation_source).toBe("gemini");
  const request = ai.models.generateContent.mock.calls[0][0];
  expect(request.config.systemInstruction).toContain("Personalize each recommendation");
  expect(request.config.systemInstruction).toContain("never invent or recalculate numbers");
  expect(JSON.parse(request.contents)[0]).toMatchObject({ ingredient: "Milk", unit: "ml", facts: { at_risk_quantity: 5 } });
});
it("does not need Gemini to warn against expired stock", async () => {
  const [result] = await explainWasteInsights([row("expired_stock")]);
  expect(ai.models.generateContent).not.toHaveBeenCalled();
  expect(result.suggestion).toBe("Standard recommendation");
});
it.each(["not JSON", '{"recommendations":[]}', '{"recommendations":[{"insight_key":"foreign","recommendation":"Unknown"}]}'])("retains factual guidance after invalid output", async text => {
  ai.models.generateContent.mockResolvedValue({ text });
  expect((await explainWasteInsights([row()]))[0].metadata.recommendation_source).toBe("standard");
});
it("retries one transient failure but keeps facts if the provider stays unavailable", async () => {
  ai.models.generateContent.mockRejectedValue({ status: 503, message: "private secret" });
  const wait = vi.fn();
  const [result] = await explainWasteInsights([row()], { wait });
  expect(ai.models.generateContent).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledTimes(1);
  expect(result.suggestion).toBe("Standard recommendation");
  expect(JSON.stringify(console.warn.mock.calls)).not.toContain("private secret");
});
it("processes sequential groups of 20 flagged concerns", async () => {
  ai.models.generateContent.mockImplementation(async ({ contents }) => response(JSON.parse(contents).map(i => i.insight_key)));
  const rows = await explainWasteInsights(Array.from({ length: 21 }, (_, i) => row("expiry_watch", `key-${i}`)));
  expect(rows.every(r => r.metadata.recommendation_source === "gemini")).toBe(true);
  expect(ai.models.generateContent.mock.calls.map(([r]) => JSON.parse(r.contents).length)).toEqual([20, 1]);
});
it("does not publish cancelled generation", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(explainWasteInsights([row()], { signal: controller.signal })).rejects.toMatchObject({ code: "GENERATION_CANCELLED" });
  expect(ai.models.generateContent).not.toHaveBeenCalled();
});
