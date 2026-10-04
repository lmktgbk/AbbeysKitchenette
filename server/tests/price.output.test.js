import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../src/modules/priceOptimization/priceOptimization.repository.js", () => ({ default: {
  getProductInfo: vi.fn(), getVariantPricingContext: vi.fn(), getRecipeDetails: vi.fn(), saveSuggestions: vi.fn(),
} }));
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
vi.mock("../src/modules/priceOptimization/priceOptimization.prompts.js", () => ({
  generatePriceSuggestions: vi.fn(), getCompetitorAverage: () => 75,
}));
import repo from "../src/modules/priceOptimization/priceOptimization.repository.js";
import { generatePriceSuggestions } from "../src/modules/priceOptimization/priceOptimization.prompts.js";
import service from "../src/modules/priceOptimization/priceOptimization.service.js";
import { normalizeRecommendations } from "../src/modules/priceOptimization/priceOptimization.output.js";

const variants = [{ variant_id: 7, product_name: "Coffee", size_name: "Regular", price: 85, cost_per_unit: 30 }];
const valid = () => ({ recommendations: [{ variant_id: 7, recommended_price: 95, confidence: 0.85, reasoning: "Ingredient cost and sales support this price." }] });
beforeEach(() => {
  vi.resetAllMocks();
  repo.getProductInfo.mockResolvedValue({ productName: "Coffee", isArchived: false });
  repo.getVariantPricingContext.mockResolvedValue(variants);
  repo.getRecipeDetails.mockResolvedValue([]);
  generatePriceSuggestions.mockResolvedValue(valid());
});
describe("AI pricing boundary", () => {
  it("uses database identity and derives financial fields", async () => {
    const response = await service.generate("product");
    const rows = repo.saveSuggestions.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ variantId: 7, productName: "Coffee", currentPrice: 85, recommendedPrice: 95,
      priceChange: 10, changePercent: 11.76, direction: "increase", marginBefore: 64.71, marginAfter: 68.42 });
    expect(repo.saveSuggestions).toHaveBeenCalledWith(rows, "product", undefined);
    expect(response[0]).toMatchObject({ variant_id: 7, product_name: "Coffee", current_price: 85, recommended_price: 95 });
  });
  it.each([null, {}, { recommendations: [] }, { recommendations: Array(51).fill(valid().recommendations[0]) }])("rejects malformed or excessive batches %j", async result => {
    generatePriceSuggestions.mockResolvedValue(result);
    await expect(service.generate("product")).rejects.toMatchObject({ statusCode: 502 });
    expect(repo.saveSuggestions).not.toHaveBeenCalled();
  });
  it.each([
    { variant_id: 8 }, { variant_id: "7" }, { variant_id: -1 },
    { recommended_price: 0 }, { recommended_price: -5 }, { recommended_price: NaN },
    { recommended_price: Infinity }, { recommended_price: 100000000 }, { recommended_price: 95.001 },
    { confidence: 1.1 }, { confidence: -0.1 }, { confidence: "0.9" },
    { reasoning: " " }, { reasoning: "x".repeat(2001) }, { current_price: 1 }, { product_name: "Forged" },
  ])("rejects untrusted fields %j before any write", async change => {
    const result = valid(); Object.assign(result.recommendations[0], change);
    generatePriceSuggestions.mockResolvedValue(result);
    await expect(service.generate("product")).rejects.toMatchObject({ statusCode: 502 });
    expect(repo.saveSuggestions).not.toHaveBeenCalled();
  });
  it("rejects duplicates as a whole batch", () => {
    const result = valid(); result.recommendations.push({ ...result.recommendations[0] });
    expect(() => normalizeRecommendations(result, variants)).toThrow("invalid recommendations");
  });
  it.each([95, 85, 75])("derives increase/keep/decrease for %s", price => {
    const result = valid(); result.recommendations[0].recommended_price = price;
    expect(normalizeRecommendations(result, variants)[0].direction).toBe(price > 85 ? "increase" : price < 85 ? "decrease" : "keep");
  });
  it("does not call AI for an archived or missing product", async () => {
    repo.getProductInfo.mockResolvedValue(null);
    await expect(service.generate("product")).rejects.toMatchObject({ statusCode: 404 });
    repo.getProductInfo.mockResolvedValue({ isArchived: true });
    await expect(service.generate("product")).rejects.toMatchObject({ statusCode: 409 });
    expect(generatePriceSuggestions).not.toHaveBeenCalled();
  });
  it("provider failures preserve pending rows", async () => {
    generatePriceSuggestions.mockRejectedValue(new Error("Provider unavailable"));
    await expect(service.generate("product")).rejects.toThrow("Provider unavailable");
    expect(repo.saveSuggestions).not.toHaveBeenCalled();
  });
});
