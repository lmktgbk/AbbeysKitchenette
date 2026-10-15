import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { ai, GEMINI_MODEL } from "../../infrastructure/integrations/gemini.js";
import { buildWastePrompt } from "./wasteReduction.prompts.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

const output = z.object({ recommendations: z.array(z.object({ insight_key: z.string(),
  recommendation: z.string().trim().min(1).max(1000) }).strict()).max(20) }).strict();
const schema = { type: "object", required: ["recommendations"], properties: { recommendations: {
  type: "array", items: { type: "object", required: ["insight_key", "recommendation"], properties: {
    insight_key: { type: "string" }, recommendation: { type: "string" } } } } } };

/** Quantities and actions stay factual. Model failures leave standard recommendations available. */
export async function explainWasteInsights(insights, { signal, wait = delay } = {}) {
  const rows = insights.map(row => ({ ...row, metadata: { ...row.metadata, recommendation_source: "standard" } }));
  // Expired-stock disposal guidance is deterministic; it never needs AI permission.
  const candidates = rows.filter(row => row.metadata.kind !== "expired_stock");
  const deadline = AbortSignal.timeout(60000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let start = 0; start < candidates.length; start += 20) {
    if (signal?.aborted) throw new AppError(503, "Generation was cancelled", "GENERATION_CANCELLED");
    if (requestSignal.aborted) break;
    const chunk = candidates.slice(start, start + 20);
    const { system, user } = buildWastePrompt(chunk);
    try {
      let response;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: user,
            config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema,
              temperature: 0.2, maxOutputTokens: 8192, abortSignal: requestSignal,
              httpOptions: { timeout: 15000, retryOptions: { attempts: 1 } } } });
          break;
        } catch (error) {
          if (attempt === 2 || requestSignal.aborted || ![408, 429, 500, 502, 503, 504].includes(Number(error.status))) throw error;
          await wait(1000 + Math.floor(Math.random() * 200), undefined, { signal: requestSignal });
        }
      }
      if (response.candidates?.[0]?.finishReason && response.candidates[0].finishReason !== "STOP") throw new Error("Incomplete response");
      if (typeof response.text !== "string" || response.text.length > 100000) throw new Error("Invalid response size");
      const parsed = output.parse(JSON.parse(response.text));
      const allowed = new Set(chunk.map(row => row.metadata.insight_key));
      if (parsed.recommendations.length !== chunk.length || new Set(parsed.recommendations.map(r => r.insight_key)).size !== chunk.length
        || parsed.recommendations.some(r => !allowed.has(r.insight_key))) throw new Error("Invalid insight keys");
      for (const row of chunk) {
        row.suggestion = parsed.recommendations.find(r => r.insight_key === row.metadata.insight_key).recommendation;
        row.metadata.recommendation_source = "gemini";
      }
    } catch (error) {
      if (signal?.aborted) throw new AppError(503, "Generation was cancelled", "GENERATION_CANCELLED");
      console.warn(JSON.stringify({ event: "waste_ai_fallback", status: Number(error.status) || null, insightCount: chunk.length }));
      // Provider overload should not block factual expiry alerts or trigger requests for every remaining chunk.
      break;
    }
  }
  if (signal?.aborted) throw new AppError(503, "Generation was cancelled", "GENERATION_CANCELLED");
  return rows;
}
