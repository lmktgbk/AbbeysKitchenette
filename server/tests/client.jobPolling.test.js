import { expect, it } from "vitest";
import { jobPollingInterval } from "../../client/src/realtime/jobPolling.js";
const job = status => ({ state: { data: { data: { status } } } });

it("keeps a missed-completion safety check even while the socket is live", () => {
  expect(jobPollingInterval(job("running"), "live")).toBe(15000);
  expect(jobPollingInterval(job("completed"), "live")).toBe(false);
});
it("speeds up recovery on disconnect and slows it again after reconnect", () => {
  for (const connection of ["connecting", "reconnecting", "disabled"]) {
    expect(jobPollingInterval(job("running"), connection)).toBe(5000);
  }
  expect(jobPollingInterval(job("running"), "live")).toBe(15000);
});
it("recovers initial and transient request failures without needing cached running status", () => {
  expect(jobPollingInterval({ state: { error: new Error("Network offline") } }, "live")).toBe(5000);
  expect(jobPollingInterval({ state: { error: { response: { status: 503 } } } }, "reconnecting")).toBe(5000);
});
it.each(["completed", "failed", "cancelled"])("stops after %s even when the socket is disconnected", status => {
  expect(jobPollingInterval(job(status), "reconnecting")).toBe(false);
});
it.each([401, 403, 404])("does not repeatedly poll inaccessible/missing jobs (%s)", status => {
  expect(jobPollingInterval({ state: { error: { response: { status } } } }, "live")).toBe(false);
});
