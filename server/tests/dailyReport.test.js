import { describe, it, expect } from "vitest";
import { reportDay } from "../src/modules/reports/dailyReport.service.js";
import { generateDailyReportEmail } from "../src/infrastructure/integrations/email.js";

describe("reportDay (Manila yesterday)", () => {
  it("maps Sep 26 15:00 Manila to Sep 25", () => {
    expect(reportDay(new Date("2026-09-26T07:00:00Z"))).toBe("2026-09-25");
  });

  it("maps Sep 25 23:59 Manila (near midnight) to Sep 24", () => {
    expect(reportDay(new Date("2026-09-25T15:59:00Z"))).toBe("2026-09-24");
  });

  it("maps Sep 26 00:30 Manila (just after midnight close) to Sep 25", () => {
    expect(reportDay(new Date("2026-09-25T16:30:00Z"))).toBe("2026-09-25");
  });
});

describe("generateDailyReportEmail", () => {
  const report = {
    day: "2026-09-25",
    kpis: {
      grossSales: 318000,
      netSales: 317600,
      transactions: 1133,
      totalUnits: 2938,
      atv: 280.3,
      cogs: 23600,
      grossProfit: 294000,
      grossMargin: 92.6,
      totalLosses: 345,
      netProfit: 293700,
      netMargin: 92.5,
      deltas: { grossSales: 43.1, netSales: 43.1 },
    },
    topVariants: [
      { product_name: "Pork Sisig Rice", size_name: "Large", units: 425, profit: 84800, margin: 95 },
    ],
    shifts: { sessions: 4, cashSales: 300000, varianceTotal: 0, offCount: 0 },
    openOrders: 3,
  };

  it("subjects the day, net sales, and order count", () => {
    const { subject } = generateDailyReportEmail(report);
    expect(subject).toContain("2026-09-25");
    expect(subject).toContain("317,600");
    expect(subject).toContain("1,133");
  });

  it("renders KPI cards, variants, and day detail as email-safe HTML", () => {
    const { html } = generateDailyReportEmail(report);
    expect(html).toContain("Daily Report — 2026-09-25");
    expect(html).toContain("Pork Sisig Rice");
    expect(html).toContain("Drawer Sessions");
    expect(html).toContain("Open Orders Carried");
    expect(html).toContain("<table");
  });
});
