import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Each process starts in its own timezone; mutating TZ in a running worker is platform-dependent.
const moduleUrl = new URL("../../client/src/lib/date.js", import.meta.url).href;
describe("calendar selection preserves business date labels across device zones", () => {
  for (const timezone of ["Asia/Manila", "Asia/Tokyo", "Pacific/Auckland", "America/Los_Angeles", "UTC"]) {
    it(timezone, () => {
      const script = `import { calendarDate, toLocalDate } from ${JSON.stringify(moduleUrl)};
        const cells = [new Date(2026, 9, 5), new Date(2026, 0, 1), new Date(2028, 1, 29), new Date(2026, 2, 8)];
        console.log(JSON.stringify({ cells: cells.map(calendarDate), businessDay: toLocalDate(new Date('2026-10-04T18:00:00Z')) }));`;
      const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: timezone }, encoding: "utf8" }));
      expect(result.cells).toEqual(["2026-10-05", "2026-01-01", "2028-02-29", "2026-03-08"]);
      expect(result.businessDay).toBe("2026-10-05");
    });
  }
});
