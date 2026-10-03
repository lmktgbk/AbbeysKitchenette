import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ send: vi.fn(), audit: vi.fn() }));
vi.mock("../src/config/prisma.js", () => ({ default: { user: { findMany: async () => [{ email: "one@example.invalid" }, { email: "two@example.invalid" }] } } }));
vi.mock("../src/modules/analytics/analytics.service.js", () => ({ analyticsService: {} }));
vi.mock("../src/modules/analytics/analytics.repository.js", () => ({ analyticsRepository: {} }));
vi.mock("../src/modules/shifts/shift.service.js", () => ({ shiftService: {} }));
vi.mock("../src/modules/orders/order.repository.js", () => ({ orderRepository: {} }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: h.audit } }));
vi.mock("../src/utils/email.js", () => ({ sendEmail: h.send, generateDailyReportEmail: () => ({ subject: "Fixture", html: "Fixture" }) }));
vi.mock("../src/modules/analytics/analytics.controller.js", () => ({ fetchExportData: async () => ({}) }));
vi.mock("../src/modules/analytics/exportPdf.js", () => ({ buildPdfBuffer: async () => Buffer.from("Fixture") }));
import { dailyReportService, reportDay } from "../src/modules/reports/dailyReport.service.js";
beforeEach(() => {
  vi.restoreAllMocks(); h.send.mockReset(); h.audit.mockReset(); h.audit.mockResolvedValue(undefined);
  vi.spyOn(dailyReportService, "buildReport").mockImplementation(async day => ({ day, kpis: {} }));
});
it("checks ownership before every recipient and stops after lease loss", async () => {
  const assertOwned = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("ownership expired"));
  await expect(dailyReportService.sendDailyReport("2026-10-02", { assertOwned })).rejects.toThrow("ownership expired");
  expect(h.send).toHaveBeenCalledOnce();
});
it("surfaces partial scheduled delivery for manual review instead of claiming full success", async () => {
  h.send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("SMTP unknown outcome"));
  await expect(dailyReportService.sendDailyReport("2026-10-02", { assertOwned: async () => {} }))
    .rejects.toThrow("SCHEDULED_REPORT_PARTIAL_DELIVERY");
  expect(h.send).toHaveBeenCalledTimes(2);
});
it("retains the scheduled report day across restart boundaries", () => {
  expect(reportDay(new Date("2026-10-02T16:30:00Z"))).toBe("2026-10-02");
});
