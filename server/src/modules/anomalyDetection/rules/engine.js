import { ai, GEMINI_MODEL } from "../../../config/gemini.js";

/**
 * Z-Score calculation using Median Absolute Deviation (MAD).
 * More robust than standard Z-score for small datasets.
 */
function computeZScore(values, current) {
  if (values.length < 3) return { zScore: 0, mean: 0, mad: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mad = sorted.reduce((sum, v) => sum + Math.abs(v - median), 0) / sorted.length;
  const zScore = mad === 0 ? 0 : (current - median) / (1.4826 * mad);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  return { zScore, mean, mad };
}

function classifySeverity(zScore, thresholds) {
  const abs = Math.abs(zScore);
  if (abs >= (thresholds.critical || 3.0)) return "critical";
  if (abs >= (thresholds.high || 2.5)) return "high";
  if (abs >= (thresholds.medium || 2.0)) return "medium";
  return "low";
}

/**
 * Generate prescriptive insight using Gemini AI.
 */
async function generateInsight(rule, data) {
  try {
    const prompt = rule.geminiPrompt(data);
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    return response.text || null;
  } catch (err) {
    console.error(`[anomaly] Gemini insight failed for "${rule.id}":`, err.message);
    return null;
  }
}

export const engine = {
  computeZScore,
  classifySeverity,

  async evaluate(rule) {
    const data = await rule.dataFetcher();
    if (!data || !data.shouldDetect) return null;

    const result = rule.condition(data, computeZScore, classifySeverity);
    if (!result || !result.triggered) return null;

    const geminiInsight = await generateInsight(rule, { ...data, ...result });

    return {
      ruleId: rule.id,
      category: rule.category,
      severity: result.severity,
      title: result.title,
      description: result.description,
      actualValue: result.actualValue,
      expectedValue: result.expectedValue,
      expectedMin: result.expectedMin,
      expectedMax: result.expectedMax,
      confidence: result.confidence,
      geminiInsight,
      detectedAt: new Date(),
    };
  },
};
