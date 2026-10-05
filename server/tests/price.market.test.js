import { describe, expect, it, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ default: { pricingMarketCache: {
  findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({}),
} } }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn().mockResolvedValue([{ address: "127.0.0.1", family: 4 }]) }));
vi.mock("../src/infrastructure/integrations/gemini.js", () => ({ ai: {}, GEMINI_MODEL: "fixture" }));
import { marketSummary, publicIPv4, validateObservations, getMarketContext } from "../src/modules/priceOptimization/priceOptimization.market.js";
import prisma from "../src/config/prisma.js";
import { lookup } from "node:dns/promises";
const variants = [{ variant_id: 7 }];
const quote = "Latte 12oz ₱120";
const sources = [{ competitor: "Fixture Cafe", url: "https://example.test/menu", text: quote, channel: "online-menu" }];
const observation = { variant_id: 7, source_index: 0, item: "Latte", portion: "12oz", price: 120, evidence: quote, promotional: false };
describe("source-backed local market references", () => {
  it("persists unavailable-source results and reuses a fresh matching cache", async () => {
    prisma.pricingMarketCache.findUnique.mockResolvedValue(null);
    const product = { product_id: "fixture", product_name: "Latte" };
    const context = await getMarketContext(product, variants);
    expect(context.variants[7]).toMatchObject({ status: "insufficient", median: null });
    expect(prisma.pricingMarketCache.upsert).toHaveBeenCalledOnce();
    prisma.pricingMarketCache.findUnique.mockResolvedValue({ context, refreshedAt: new Date() });
    const calls = lookup.mock.calls.length;
    expect(await getMarketContext(product, variants)).toEqual(context);
    expect(lookup.mock.calls.length).toBe(calls);
    prisma.pricingMarketCache.findUnique.mockResolvedValue({ context, refreshedAt: new Date(Date.now() - 8 * 86400000) });
    await getMarketContext(product, variants);
    expect(lookup.mock.calls.length).toBeGreaterThan(calls);
  });
  it("keeps source, portion and collection evidence", () => {
    expect(validateObservations({ observations: [observation] }, sources, variants)[0]).toMatchObject({ price: 120, evidence: quote, competitor: "Fixture Cafe", portion: "12oz" });
  });
  it.each([{ evidence: "Latte 12oz ₱90" }, { price: 90 }, { variant_id: 8 }, { source_index: 9 }, { promotional: true }, { portion: "16oz" }])("rejects unsupported comparison %j", change => {
    expect(validateObservations({ observations: [{ ...observation, ...change }] }, sources, variants)).toEqual([]);
  });
  it("requires three distinct competitors and resists an outlier", () => {
    const records = [100, 120, 900].map((price, index) => ({ variantId: 7, price, competitor: `Cafe${index}`, collectedAt: new Date().toISOString() }));
    expect(marketSummary(records, variants)[7]).toMatchObject({ median: 120, range: [100, 900], count: 3, status: "available" });
    expect(marketSummary([...records.slice(0, 2), records[0]], variants)[7]).toMatchObject({ median: null, count: 2, status: "insufficient" });
  });
  it("excludes stale and future collection dates", () => {
    const records = [{ variantId: 7, price: 100, competitor: "Cafe", collectedAt: new Date(Date.now() - 31 * 86400000).toISOString() },
      { variantId: 7, price: 100, competitor: "Future", collectedAt: new Date(Date.now() + 86400000).toISOString() }];
    expect(marketSummary(records, variants)[7].count).toBe(0);
  });
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1"])("blocks non-public menu destinations %s", address => {
    expect(publicIPv4(address)).toBe(false);
  });
});
