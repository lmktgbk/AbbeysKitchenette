import { expect, it } from "vitest";
import { shiftAlertDetails } from "../../client/src/features/shifts/shiftUtils.js";
const id = "2b109895-83f8-4774-b4a6-ebda389d4b7c";
it.each([[5, "over"], [-5, "short"]])("explains a %s cash difference without exposing UUIDs", (amount, verdict) => {
  const result = shiftAlertDetails(`Shift 2b109895 off by ₱${amount} (expected ₱1,125, actual ₱1,130) [${id}].`);
  expect(result.shiftId).toBe(id);
  expect(result.description).toContain(`${verdict} by ₱5`);
  expect(result.description).toContain("Expected cash: ₱1,125");
  expect(result.description).not.toContain(id);
});
it("leaves other notifications unchanged", () => {
  expect(shiftAlertDetails("Order completed").description).toBe("Order completed");
});
