import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("../src/infrastructure/integrations/gemini.js", () => ({ GEMINI_MODEL: "fixture", ai: { models: { generateContent: vi.fn() } } }));
import { ai } from "../src/infrastructure/integrations/gemini.js";
import { generateReorderChunk, requestDiagnostics } from "../src/modules/reorderSuggestions/reorderSuggestions.provider.js";
import { buildReorderContexts } from "../src/modules/reorderSuggestions/reorderSuggestions.analysis.js";
const contexts = () => buildReorderContexts({ today: "2026-10-15", forecast: null, batches: [], demand: [], usage: [],
  ingredients: [{ ingredient_id: "milk", ingredient_name: "Milk", unit: "ml", minimum_threshold: 100 }] });
const response = () => ({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ recommendations: [
  { ingredient_id: "milk", unit: "ml", suggested_quantity: 250, urgency: "high", reason: "Forecast unavailable; cover minimum stock and review usage." },
] }) });
let warn;
beforeEach(() => { vi.resetAllMocks(); warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

it("requests structured output and locally validates the resulting quantities", async () => {
  ai.models.generateContent.mockResolvedValue(response());
  const [row] = await generateReorderChunk(contexts());
  expect(row.suggested_quantity).toBe(250);
  const { config } = ai.models.generateContent.mock.calls[0][0];
  expect(config.responseJsonSchema.properties.recommendations.items.properties.ingredient_id).toEqual({ type: "string" });
  expect(config.responseJsonSchema.properties.recommendations).not.toHaveProperty("maxItems");
  expect(config.httpOptions.retryOptions.attempts).toBe(1);
  expect(config.httpOptions.timeout).toBe(45000);
});
it("recovers from a transient 503 using bounded backoff", async () => {
  ai.models.generateContent.mockRejectedValueOnce({ status: 503, message: "private-key-secret" }).mockResolvedValue(response());
  const wait = vi.fn();
  await expect(generateReorderChunk(contexts(), { wait })).resolves.toHaveLength(1);
  expect(wait).toHaveBeenCalledTimes(1);
  expect(ai.models.generateContent).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private-key-secret");
});
it.each([[503, "REORDER_AI_UNAVAILABLE"], [429, "REORDER_AI_RATE_LIMITED"], [504, "REORDER_AI_TIMEOUT"]])("stops retrying status %i after three attempts", async (status, code) => {
  ai.models.generateContent.mockRejectedValue({ status, message: "private provider details" });
  const wait = vi.fn();
  await expect(generateReorderChunk(contexts(), { wait })).rejects.toMatchObject({ code });
  expect(ai.models.generateContent).toHaveBeenCalledTimes(3);
  expect(wait).toHaveBeenCalledTimes(2);
});
it.each([[401, "REORDER_AI_CREDENTIALS"], [403, "REORDER_AI_CREDENTIALS"], [404, "REORDER_AI_MODEL_UNAVAILABLE"], [400, "REORDER_AI_REQUEST_INVALID"]])("does not retry nontransient status %i", async (status, code) => {
  ai.models.generateContent.mockRejectedValue({ status });
  const wait = vi.fn();
  await expect(generateReorderChunk(contexts(), { wait })).rejects.toMatchObject({ code });
  expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
  expect(wait).not.toHaveBeenCalled();
});
it("identifies invalid JSON without logging model text", async () => {
  ai.models.generateContent.mockResolvedValue({ text: "private malformed response" });
  await expect(generateReorderChunk(contexts())).rejects.toMatchObject({ code: "INVALID_REORDER_ADVICE" });
  expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ phase: "json" });
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private malformed response");
});
it("distinguishes truncated output from schema validation failures", async () => {
  ai.models.generateContent.mockResolvedValue({ ...response(), candidates: [{ finishReason: "MAX_TOKENS" }] });
  await expect(generateReorderChunk(contexts())).rejects.toMatchObject({ code: "REORDER_AI_INCOMPLETE" });
  const result = response(); result.text = result.text.replace('"ml"', '"l"');
  ai.models.generateContent.mockResolvedValue(result);
  await expect(generateReorderChunk(contexts())).rejects.toMatchObject({ code: "INVALID_REORDER_ADVICE", diagnostic: { reason: "unit_mismatch" } });
});
it("does not send requests after cancellation", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(generateReorderChunk(contexts(), { signal: controller.signal })).rejects.toThrow();
  expect(ai.models.generateContent).not.toHaveBeenCalled();
});
it("classifies 400 schema errors without leaking descriptions or credentials", () => {
  const result = requestDiagnostics({ message: JSON.stringify({ error: { message: "Schema too complex: private-key", details: [{ fieldViolations: [
    { field: "generation_config.response_json_schema", description: "private-key" },
    { field: "private-key", description: "private-key" },
  ] }] } }) });
  expect(result).toEqual({ requestIssue: "schema_complexity", fields: ["generation_config.response_json_schema"] });
  expect(JSON.stringify(result)).not.toContain("private-key");
  expect(requestDiagnostics({ message: '{"error":{"details":"not an array"}}' })).toEqual({ requestIssue: "unknown", fields: [] });
});
