import { setTimeout as delay } from "node:timers/promises";
import { ai, GEMINI_MODEL } from "../../infrastructure/integrations/gemini.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { buildReorderPrompt } from "./reorderSuggestions.prompts.js";
import { normalizeReorders } from "./reorderSuggestions.analysis.js";

/** Structured output constrains shape; IDs, units and purchase quantities are still validated locally. */
function responseSchema() {
  // Keep the provider grammar small. Exact IDs, counts, units, ranges and precision
  // are checked by normalizeReorders rather than encoded as a large UUID enum.
  return { type: "object", required: ["recommendations"],
    properties: { recommendations: { type: "array",
      items: { type: "object",
        required: ["ingredient_id", "unit", "suggested_quantity", "urgency", "reason"],
        properties: { ingredient_id: { type: "string" },
          unit: { type: "string" },
          suggested_quantity: { type: "number" },
          urgency: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" } } } } } };
}

/** Classify 400 details without exposing the provider message or echoed request. */
export function requestDiagnostics(error) {
  const text = String(error.message || "");
  let requestIssue = "unknown";
  if (/too many states|too complex|complexity/i.test(text)) requestIssue = "schema_complexity";
  else if (/schema|additionalProperties|minItems|maxItems|minLength|maxLength/i.test(text)) requestIssue = "schema_rejected";
  else if (/api.key|api_key/i.test(text)) requestIssue = "api_key_rejected";
  else if (/not supported|unsupported|not available/i.test(text)) requestIssue = "unsupported_setting";
  else if (/token|temperature|generationConfig/i.test(text)) requestIssue = "generation_setting";
  let parsed;
  try { parsed = JSON.parse(text); } catch { /* SDKs may return a non-JSON message. */ }
  const details = Array.isArray(parsed?.error?.details) ? parsed.error.details : [];
  const fields = details.flatMap(d => Array.isArray(d?.fieldViolations) ? d.fieldViolations : [])
    .map(v => v?.field).filter(f => typeof f === "string" && /^(generation_config|generationConfig|contents|model)(\.[A-Za-z_][A-Za-z_0-9]*)*$/.test(f)).slice(0, 6);
  return { requestIssue, fields };
}

function providerError(status) {
  const preserved = " Previous suggestions were preserved.";
  if (status === 429) return new AppError(503, "Gemini's request or quota limit was reached. Check AI Studio limits before retrying." + preserved, "REORDER_AI_RATE_LIMITED");
  if ([401, 403].includes(status)) return new AppError(503, "Gemini rejected the configured API credentials or permissions. Check the backend API key." + preserved, "REORDER_AI_CREDENTIALS");
  if (status === 404) return new AppError(503, "The configured Gemini model was not found. Check GEMINI_MODEL." + preserved, "REORDER_AI_MODEL_UNAVAILABLE");
  if (status === 400) return new AppError(502, "Gemini rejected the restock request format or model settings. Check the backend diagnostics." + preserved, "REORDER_AI_REQUEST_INVALID");
  if ([408, 504].includes(status)) return new AppError(504, "Gemini took too long to respond. Please try again." + preserved, "REORDER_AI_TIMEOUT");
  if (status >= 500) return new AppError(503, "Gemini is temporarily unavailable or busy. Please try again shortly." + preserved, "REORDER_AI_UNAVAILABLE");
  return new AppError(502, "AI restock recommendations could not be generated. Please try again." + preserved, "REORDER_AI_UNAVAILABLE");
}

/** Log only allowlisted diagnostics: never error messages, credentials, prompts or raw model text. */
function logFailure(phase, fields) {
  console.warn(JSON.stringify({ event: "reorder_ai_failure", phase, model: GEMINI_MODEL, ...fields }));
}

export async function generateReorderChunk(contexts, { signal, wait = delay } = {}) {
  const { system, user } = buildReorderPrompt(contexts);
  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    signal?.throwIfAborted();
    const startedAt = Date.now();
    try {
      response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: user,
        config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: responseSchema(),
          temperature: 0.2, abortSignal: signal,
          httpOptions: { timeout: 45000, retryOptions: { attempts: 1 } }, maxOutputTokens: 8192 } });
      break;
    } catch (error) {
      if (signal?.aborted) throw error;
      const status = Number(error.status) || 0;
      const retry = attempt < 3 && [408, 429, 500, 502, 503, 504].includes(status);
      logFailure("provider", { status, attempt, retry, elapsedMs: Date.now() - startedAt, ingredientCount: contexts.length, ...(status === 400 ? requestDiagnostics(error) : {}) });
      if (!retry) throw providerError(status);
      await wait(1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200), undefined, { signal });
    }
  }
  const finishReason = response?.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    logFailure("finish", { truncated: finishReason === "MAX_TOKENS", ingredientCount: contexts.length });
    throw new AppError(502, "Gemini did not complete the restock response. Previous suggestions were preserved. Please try again", "REORDER_AI_INCOMPLETE");
  }
  let parsed;
  try {
    const text = response?.text;
    if (typeof text !== "string" || text.length > 100000) throw new Error("Invalid response size");
    parsed = JSON.parse(text);
  } catch {
    logFailure("json", { ingredientCount: contexts.length });
    throw new AppError(502, "Gemini returned unreadable restock advice. Previous suggestions were preserved", "INVALID_REORDER_ADVICE");
  }
  try { return normalizeReorders(parsed, contexts); }
  catch (error) {
    logFailure("validation", { ingredientCount: contexts.length, ...(error.diagnostic || {}) });
    throw error;
  }
}
