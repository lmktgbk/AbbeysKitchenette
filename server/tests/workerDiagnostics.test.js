import { it, expect, vi } from "vitest";
import { createWorkerFailureReporter, workerFailureCode } from "../src/utils/workerDiagnostics.js";

it("classifies connection, pool and database failures without exposing sensitive errors", () => {
  expect(workerFailureCode({ cause: { code: "ECONNRESET" } })).toBe("ECONNRESET");
  expect(workerFailureCode({ code: "53300" })).toBe("53300");
  expect(workerFailureCode({ message: "timeout exceeded when trying to connect" })).toBe("DB_POOL_TIMEOUT");
  const warn = vi.fn(), report = createWorkerFailureReporter({ warn });
  report("anomaly", { code: "secret-token", message: "postgres://private:password@host/database", stack: "private SQL" });
  expect(warn.mock.calls[0][0]).toContain("UNCLASSIFIED");
  expect(warn.mock.calls[0][0]).not.toMatch(/password|secret-token|private SQL/);
});

it("limits identical warnings to once per minute without suppressing new error codes", () => {
  let time = 0; const warn = vi.fn(), report = createWorkerFailureReporter({ warn, now: () => time });
  report("effects", { code: "ETIMEDOUT" });
  time = 5000; report("effects", { code: "ETIMEDOUT" });
  report("effects", { code: "ECONNRESET" });
  expect(warn).toHaveBeenCalledTimes(2);
  time = 60000; report("effects", { code: "ETIMEDOUT" });
  expect(warn).toHaveBeenCalledTimes(3);
});
