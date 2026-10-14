import { expect, it } from "vitest";
import { cancelOrderSchema, removeItemSchema } from "../src/modules/orders/order.validation.js";
import { computeRefundAmount } from "../src/modules/orders/order.pricing.js";

it.each([cancelOrderSchema, removeItemSchema])("accepts only full/no refund and rejects custom amounts", schema => {
  const input = { reason: "customer_changed_mind" };
  expect(schema.parse(input).refund_option).toBe("full");
  for (const refund_option of ["full", "none"]) expect(schema.safeParse({ ...input, refund_option }).success).toBe(true);
  expect(schema.safeParse({ ...input, refund_option: "partial", refund_amount: 10 }).success).toBe(false);
  expect(schema.safeParse({ ...input, refund_option: "full", refund_amount: 10 }).success).toBe(false);
});
it("caps a full refund at the net reduction and remaining payment; rejects partial internally", () => {
  const values = { limit: 80, paid: 100, priorRefunded: 40 };
  expect(computeRefundAmount({ ...values, option: "full" })).toBe(60);
  expect(computeRefundAmount({ ...values, option: "none" })).toBe(0);
  expect(() => computeRefundAmount({ ...values, option: "partial", requestedAmount: 10 })).toThrow("Choose full refund or no refund");
});
