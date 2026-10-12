import { expect, it, vi } from "vitest";
const policy = vi.hoisted(() => vi.fn());
vi.mock("../src/utils/ipCheck.js", () => ({ isStoreIP: policy }));
vi.mock("../src/config/env.js", () => ({ env: { NODE_ENV: "production", TRUST_PROXY_HOPS: 1 } }));
vi.mock("../src/modules/settings/settings.service.js", () => ({ settingsService: {} }));
vi.mock("../src/modules/automation/automation.scheduler.js", () => ({ automationScheduler: {} }));
vi.mock("../src/infrastructure/realtime/events.js", () => ({ emitSettingsChanged: vi.fn() }));
import { settingsController } from "../src/modules/settings/settings.controller.js";
const response = () => ({ set: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });

it.each([true, false])("reports the saved-policy result (%s), using req.ip rather than a proxy hint", async allowed => {
  policy.mockResolvedValue(allowed);
  const res = response();
  await settingsController.checkNetwork({ user: { role: "admin" }, ip: "203.0.113.1", get: () => "203.0.113.2" }, res);
  expect(policy).toHaveBeenLastCalledWith("203.0.113.1");
  expect(res.set).toHaveBeenCalledWith("Cache-Control", "no-store");
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { address: "203.0.113.1", allowed, developmentBypass: false, proxyHops: 1, addressSource: "proxy", proxyReportedAddress: "203.0.113.2" } }));
});

it("rejects non-admins before querying policy", async () => {
  policy.mockClear();
  const res = response();
  await settingsController.checkNetwork({ user: { role: "cashier" } }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(policy).not.toHaveBeenCalled();
});

it("does not echo malformed proxy headers", async () => {
  policy.mockResolvedValue(false);
  const res = response();
  await settingsController.checkNetwork({ user: { role: "admin" }, ip: "203.0.113.1", get: () => "untrusted text" }, res);
  expect(res.json.mock.calls[0][0].data.proxyReportedAddress).toBeNull();
});
