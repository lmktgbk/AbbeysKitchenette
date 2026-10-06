import { describe, it, expect } from "vitest";
import { ingredients, products } from "../prisma/demo/catalog.js";
import { receipts } from "../prisma/demo/receipts.js";
import { START, validateCatalog, planDay, takeStock, dates, seedId } from "../prisma/demo/plan.js";

describe("Demo seed plans", () => {
  it("includes sales history from January 2025 through the completed cutoff", () => {
    expect(START).toBe("2025-01-01");
    const history = dates(START, "2026-10-05");
    expect(history).toHaveLength(643);
    expect(history.at(-1)).toBe("2026-10-05");
    expect(planDay(history[0]).length).toBeGreaterThan(0);
  });
  it("resolves every recipe and all 37 receipt samples", () => {
    expect(validateCatalog).not.toThrow();
    expect(receipts).toHaveLength(37);
    expect(receipts.reduce((sum, r) => sum + r[4].reduce((s, l) => s + l[0], 0), 0)).toBe(161);
    expect(products.find(([name]) => name === "Abbey's Yard Choco")).toBeUndefined();
    expect(products.find(([name]) => name === "Abbey's Seafood Pancit")[3][0][1]).toBe(250);
  });
  it("preserves receipt line quantities, including repeated variants", () => {
    receipts.forEach((receipt, index) => {
      const actual = planDay(receipt[0]).find((order) => order.id === seedId(`receipt:${index}`));
      expect(actual.lines.map((l) => [l.quantity, l.name, l.size])).toEqual(receipt[4]);
      expect(actual.payment).toBe(receipt[3]);
    });
  });
  it("produces identical days across full runs and incremental extensions", () => {
    const all = dates("2026-09-01", "2026-10-05").flatMap(planDay);
    const split = [...dates("2026-09-01", "2026-09-28"), ...dates("2026-09-29", "2026-10-05")].flatMap(planDay);
    expect(split).toEqual(all);
    expect(new Set(all.map((o) => o.id)).size).toBe(all.length);
    expect(dates("2026-02-28", "2026-03-01")).toEqual(["2026-02-28", "2026-03-01"]);
    expect(() => dates("2026-02-30", "2026-03-01")).toThrow();
  });
  it("allocates FIFO without overdrawing or losing fractional stock", () => {
    const batches = [{ left: 0.3 }, { left: 1 }];
    expect(takeStock(batches, 0.7).map((a) => a.quantity)).toEqual([0.3, 0.4]);
    expect(batches.map((b) => b.left)).toEqual([0, 0.6]);
    expect(() => takeStock([{ left: 1 }], 2)).toThrow("Insufficient");
  });
  it("contains demand variation and mixed baskets without negative costs", () => {
    const days = dates("2026-01-01", "2026-01-31").map(planDay);
    expect(new Set(days.map((d) => d.length)).size).toBeGreaterThan(5);
    expect(days.flat().some((o) => o.lines.length > 1)).toBe(true);
    expect(ingredients.every((i) => i[4] > 0)).toBe(true);
  });
});
