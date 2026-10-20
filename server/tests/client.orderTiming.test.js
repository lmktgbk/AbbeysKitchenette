import { describe, expect, it } from "vitest";
import { orderTiming } from "../../client/src/features/orders/orderTiming.js";

const accepted = "2026-10-20T08:00:00Z";
const now = Date.parse("2026-10-20T08:10:12Z");

describe("continuous order acceptance timer", () => {
  it("does not start while pending", () => {
    expect(orderTiming({ status: "pending" }, now)).toMatchObject({ value: "Not accepted yet", running: false });
  });
  it("continues from acceptance through preparation, item updates and reloads", () => {
    const initial = { status: "accepted", accepted_at: accepted, created_at: "2026-10-20T07:00:00Z" };
    const preparing = { ...initial, status: "preparing", preparing_at: "2026-10-20T08:03:00Z", updated_at: "2026-10-20T08:10:00Z" };
    for (const order of [initial, preparing, JSON.parse(JSON.stringify(preparing))]) {
      expect(orderTiming(order, now)).toMatchObject({ label: "Elapsed", value: "10m 12s", running: true, elapsed: 612000 });
    }
  });
  it.each(["completed", "cancelled"])("freezes %s duration, independent of the current time", status => {
    const order = { status, accepted_at: accepted, [`${status}_at`]: "2026-10-20T08:10:12Z" };
    const expected = { label: status === "completed" ? "Completed in" : "Cancelled after", value: "10m 12s", running: false };
    expect(orderTiming(order, now)).toMatchObject(expected);
    expect(orderTiming(order, now + 86400000)).toMatchObject(expected);
  });
  it("identifies cancellation before acceptance", () => {
    expect(orderTiming({ status: "cancelled", cancelled_at: accepted }, now).value).toBe("Cancelled before acceptance");
  });
  it.each([
    { status: "preparing" },
    { status: "completed", completed_at: accepted },
    { status: "completed", accepted_at: accepted },
    { status: "cancelled", accepted_by: "historic-user" },
    { status: "cancelled", preparing_at: accepted },
    { status: "completed", accepted_at: accepted, completed_at: "2026-10-20T07:59:00Z" },
    { status: "accepted", accepted_at: "invalid" },
    { status: "accepted", accepted_at: "2026-10-20T09:00:00Z" },
  ])("does not invent a duration for missing or invalid timestamps: %j", order => {
    expect(orderTiming(order, now)).toMatchObject({ value: "Not recorded", running: false });
  });
});
