import { beforeEach, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({ callbacks: [], stops: [], find: vi.fn(), run: vi.fn() }));
vi.mock("node-cron", () => ({ default: { validate: () => true, schedule: (expr, callback) => {
  h.callbacks.push(callback); const stop = vi.fn(); h.stops.push(stop); return { stop };
} } }));
vi.mock("../src/modules/settings/settings.repository.js", () => ({ settingsRepository: { find: h.find } }));
vi.mock("../src/modules/reorderSuggestions/reorderSuggestions.service.js", () => ({ reorderSuggestionsService: { generate: h.run } }));
vi.mock("../src/modules/wasteReduction/wasteReduction.service.js", () => ({ wasteReductionService: {} }));
vi.mock("../src/modules/reports/dailyReport.service.js", () => ({ dailyReportService: {} }));
vi.mock("../src/modules/auditLogs/auditLog.service.js", () => ({ auditLogService: { logAction: async () => {} } }));
vi.mock("../src/services/mlClient.js", () => ({ fetchMl: vi.fn() }));
import { automationScheduler as scheduler } from "../src/modules/automation/automation.scheduler.js";
const settings = { automation: { reorder: { enabled: true, time: "08:00", frequency: "daily" } } };
beforeEach(() => {
  h.callbacks.length = 0; h.stops.length = 0; h.run.mockReset(); h.find.mockReset();
  scheduler._tasks = {}; scheduler._active = new Set(); scheduler._stopping = false;
  h.find.mockResolvedValue(settings);
});
it("stops admission and drains an active scheduled job", async () => {
  let release;
  h.run.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await scheduler.reschedule();
  h.callbacks[0]();
  let finished = false;
  const stop = scheduler.stop().then(() => { finished = true; });
  await Promise.resolve();
  expect(finished).toBe(false);
  h.callbacks[0]();
  expect(h.run).toHaveBeenCalledTimes(1);
  release(); await stop;
  expect(h.stops[0]).toHaveBeenCalledOnce();
  await scheduler.reschedule();
  expect(h.callbacks).toHaveLength(1);
});
it("does not install schedules when a settings read finishes after shutdown", async () => {
  let release;
  h.find.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const load = scheduler.reschedule();
  await scheduler.stop(); release(settings); await load;
  expect(h.callbacks).toHaveLength(0);
});
