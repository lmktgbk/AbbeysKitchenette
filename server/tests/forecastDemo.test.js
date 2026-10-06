import { describe, it, expect } from "vitest";
import { forecastDemoDay, forecastDemoBaselineDay } from "../prisma/demo/forecast-plan.js";
import { dates, planDay } from "../prisma/demo/plan.js";
import { receipts } from "../prisma/demo/receipts.js";

describe("Controlled forecasting demo", () => {
  it("preserves all actual receipt samples and their quantities", () => {
    const generated = [...new Set(receipts.map((r)=>r[0]))].flatMap(forecastDemoDay).filter((o)=>o.source==='receipt');
    const original = [...new Set(receipts.map((r)=>r[0]))].flatMap(planDay).filter((o)=>o.source==='receipt');
    expect(generated).toEqual(original);
    expect(generated).toHaveLength(37);
  });
  it("preserves every v2 daily variant quantity and order count across the entire seed", () => {
    const quantities = orders => {
      const totals = new Map();
      for (const order of orders) for (const line of order.lines) {
        const key = `${line.name}|${line.size}`;
        totals.set(key, (totals.get(key) || 0) + line.quantity);
      }
      return [...totals].sort(([a], [b]) => a.localeCompare(b));
    };
    let solo = 0, regrouped = 0;
    for (const day of dates("2025-01-01", "2026-10-05")) {
      const before = forecastDemoBaselineDay(day), after = forecastDemoDay(day);
      expect(after.length).toBe(before.length);
      expect(quantities(after)).toEqual(quantities(before));
      expect(after.filter(o => o.source === "receipt")).toEqual(before.filter(o => o.source === "receipt"));
      for (let i = 0; i < after.length; i++) if (after[i].source === "synthetic") {
        if (after[i].lines.reduce((n, line) => n + line.quantity, 0) === 1) solo++;
        if (JSON.stringify(after[i].lines) !== JSON.stringify(before[i].lines)) regrouped++;
      }
    }
    expect(solo).toBeGreaterThan(100);
    expect(regrouped).toBeGreaterThan(1000);
  });
  it("reproduces dates independently of preview order and extension boundary", () => {
    const first = forecastDemoDay('2026-09-28');
    forecastDemoDay('2025-01-01'); forecastDemoDay('2026-10-05');
    expect(forecastDemoDay('2026-09-28')).toEqual(first);
    const days=dates('2026-09-27','2026-10-06');
    const all=days.flatMap(forecastDemoDay);
    expect([...days.slice(0,3).flatMap(forecastDemoDay),...days.slice(3).flatMap(forecastDemoDay)]).toEqual(all);
    expect(new Set(all.map((o)=>o.id)).size).toBe(all.length);
  });
  it("keeps traffic near the approved 10 daily average with mixed basket sizes", () => {
    const days=dates('2025-01-01','2026-10-05').map(forecastDemoDay);
    const synthetic=days.flat().filter((o)=>o.source==='synthetic');
    expect(synthetic.length/days.length).toBeGreaterThan(9);
    expect(synthetic.length/days.length).toBeLessThan(11);
    // Lower traffic may leave rare variants unsold; do not manufacture sales for coverage.
    const average=synthetic.reduce((s,o)=>s+o.lines.reduce((n,l)=>n+l.quantity,0),0)/synthetic.length;
    expect(average).toBeGreaterThan(2); expect(average).toBeLessThan(3);
    expect(new Set(days.map((d)=>d.length)).size).toBeGreaterThan(5);
    expect(synthetic.every((o)=>o.lines.every((l)=>l.quantity>0 && Number.isInteger(l.quantity) && l.recipe.length>0))).toBe(true);
  });
});
