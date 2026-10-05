import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ capture: vi.fn(), fetch: vi.fn() }));
vi.mock("../src/config/prisma.js", () => ({ default: { $transaction: write => write({ domainEffect: { create: h.capture } }) } }));
vi.mock("../src/infrastructure/integrations/ml/ml.client.js", () => ({ fetchMl: h.fetch }));
import { proxyMlMutation } from "../src/infrastructure/integrations/ml/ml.mutation.js";
const options = { serviceLabel: "Forecast", fallbackCode: "ML_ERROR", okMessage: "Accepted", action: "FORECAST_RUN", targetType: "forecast" };
function run() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  return proxyMlMutation({ user: { id: "00000000-0000-4000-8000-000000000001" } }, res, "/forecast", options).then(() => res);
}
beforeEach(() => { vi.restoreAllMocks(); h.capture.mockReset().mockResolvedValue({}); h.fetch.mockReset(); });
it("does not contact ML when attempt capture fails", async () => {
  h.capture.mockRejectedValueOnce(Error("storage unavailable"));
  const res = await run(); expect(res.status).toHaveBeenCalledWith(503); expect(h.fetch).not.toHaveBeenCalled();
});
it("records accepted job correlation", async () => {
  h.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ job_id: 42 }) });
  const res = await run(); expect(res.status).toHaveBeenCalledWith(200);
  expect(h.capture.mock.calls[1][0].data.payload.audit.details).toMatchObject({ outcome: "service-accepted", jobId: 42 });
});
it("does not replay an accepted call when outcome capture fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.capture.mockResolvedValueOnce({}).mockRejectedValueOnce(Error("storage unavailable"));
  h.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ job_id: 42 }) });
  const res = await run(); expect(res.status).toHaveBeenCalledWith(200); expect(h.fetch).toHaveBeenCalledOnce();
});
it("reports network ambiguity without retrying", async () => {
  h.fetch.mockRejectedValue(Error("connection dropped"));
  const res = await run(); expect(res.json.mock.calls[0][0].error).toBe("ML_OUTCOME_UNCONFIRMED");
  expect(h.fetch).toHaveBeenCalledOnce(); expect(h.capture.mock.calls[1][0].data.payload.audit.details.outcome).toBe("unconfirmed");
});
it("preserves service rejection and captures its outcome", async () => {
  h.fetch.mockResolvedValue({ ok: false, status: 409 });
  const res = await run(); expect(res.status).toHaveBeenCalledWith(409);
  expect(h.capture.mock.calls[1][0].data.payload.audit.details.outcome).toBe("service-rejected");
});
