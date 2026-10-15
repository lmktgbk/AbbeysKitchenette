import { it, expect, vi } from "vitest";
vi.mock("../src/config/prisma.js", () => ({ default: { $queryRawUnsafe: vi.fn() } }));
import prisma from "../src/config/prisma.js";
import { revenueAnomaly } from "../src/modules/anomalyDetection/rules/revenueAnomaly.js";
import { cancellationSpike } from "../src/modules/anomalyDetection/rules/cancellationSpike.js";
import { discountSpike } from "../src/modules/anomalyDetection/rules/discountSpike.js";
import { refundSpike } from "../src/modules/anomalyDetection/rules/refundSpike.js";
import { lossSpike } from "../src/modules/anomalyDetection/rules/lossSpike.js";
import { anomalyGuidance } from "../../client/src/features/anomalyDetection/guidance.js";

it("labels assessed full-day revenue with its business date and arithmetic average", () => {
  const result = revenueAnomaly.condition({ todayRevenue: 10, historical: [80, 100, 120], todayStr: "2026-10-15" },
    () => ({ zScore: -3, mean: 100, mad: 20 }), () => "critical");
  expect(result.description).toContain("Recorded revenue for 2026-10-15 was ₱10");
  expect(result.description).toContain("historical daily average ₱100");
  expect(result.description).not.toContain("Yesterday");
  const prompt = revenueAnomaly.geminiPrompt({ todayRevenue: 10, mean: 100, dayName: "Thursday", trend: [80, 100, 120] });
  expect(prompt).not.toContain("30-day median");
  expect(prompt).toContain("completed Manila calendar day");
});

it("assesses yesterday and excludes current running sales using Manila date boundaries", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
  prisma.$queryRawUnsafe.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ day: `2026-10-${String(7 + i).padStart(2, "0")}`, revenue: i === 7 ? 10 : 100 })));
  try {
    const data = await revenueAnomaly.dataFetcher();
    expect(data.shouldDetect).toBe(true);
    expect(data.todayStr).toBe("2026-10-14");
    expect(data.todayRevenue).toBe(10);
    expect(data.historical).toHaveLength(7);
    expect(prisma.$queryRawUnsafe.mock.calls.at(-1)[2].toISOString()).toBe("2026-10-14T16:00:00.000Z");
    prisma.$queryRawUnsafe.mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${String(7 + i).padStart(2, "0")}`, revenue: 100 })));
    expect((await revenueAnomaly.dataFetcher()).shouldDetect).toBe(false);
  } finally { vi.useRealTimers(); }
});

it.each([cancellationSpike, discountSpike, refundSpike, lossSpike])("does not label lower activity as a spike: $id", rule => {
  const data = { todayRate: 10, todayTotal: 10, todayCancelled: 1, todayCount: 1, todayCost: 10,
    historicalRates: [100, 110, 90], historicalCosts: [100, 110, 90], historical: [100, 110, 90] };
  const score = zScore => () => ({ zScore, mean: 100, mad: 10 });
  expect(rule.condition(data, score(-3), () => "critical").triggered).toBe(false);
  expect(rule.condition(data, score(3), () => "critical").triggered).toBe(true);
});

it("provides actionable fallback for older cash findings with no AI response", () => {
  const result = anomalyGuidance({ category: "cash", geminiInsight: null });
  expect(result.aiAssisted).toBe(false);
  expect(result.text).toContain("opening float");
  expect(result.text).toContain("Recount the drawer");
});

it("preserves saved AI advice and handles empty or unknown categories", () => {
  expect(anomalyGuidance({ category: "cash", geminiInsight: " Review closing notes. " })).toEqual({ text: "Review closing notes.", aiAssisted: true });
  const result = anomalyGuidance({ category: "unknown", geminiInsight: "  " });
  expect(result.aiAssisted).toBe(false);
  expect(result.text).toContain("confirm the reported values");
});
