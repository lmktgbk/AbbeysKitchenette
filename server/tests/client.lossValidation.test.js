import { expect, it } from "vitest";
import { lossSchema } from "../../client/src/features/ingredients/ingredientValidation.js";
it.each(["", undefined, "invalid"])("shows a friendly message for an invalid loss type (%s)", loss_type => {
  const result = lossSchema.safeParse({ loss_type, quantity_lost: 1 });
  expect(result.success).toBe(false);
  expect(result.error.issues[0].message).toBe("Select a loss type");
});
it.each(["spoilage", "spillage", "expiry", "other"])("accepts %s", loss_type => {
  expect(lossSchema.safeParse({ loss_type, quantity_lost: 1 }).success).toBe(true);
});
