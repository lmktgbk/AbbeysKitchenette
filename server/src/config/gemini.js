import { GoogleGenAI } from "@google/genai";
import { env } from "./env.js";

/**
 * Gemini AI Client
 *
 * Singleton instance for the Google Gen AI SDK.
 * Used by reorderSuggestions and wasteReduction modules
 * to generate prescriptive analytics insights.
 */
export const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
export const GEMINI_MODEL = env.GEMINI_MODEL;
