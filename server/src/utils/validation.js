import { z } from "zod";

export const LIMITS = Object.freeze({ page: 1000, pageSize: 100, orderLines: 100, orderQuantity: 1000,
  variants: 50, recipeLines: 100, money: 99999999.99, stock: 9999999.999, unitCost: 999999.9999 });

// Keep string query contracts used by existing controllers; reject coercion surprises such as arrays.
export const queryInteger = (max = 2147483647) => z.string().max(10).regex(/^\d+$/, "Expected a positive integer")
  .refine(value => Number(value) >= 1 && Number(value) <= max, `Value must be between 1 and ${max}`);
export const pageQuery = queryInteger(LIMITS.page).optional().default("1");
export const limitQuery = (fallback = "50") => queryInteger(LIMITS.pageSize).optional().default(fallback);
export const integerId = z.number().int().positive().max(2147483647);
export const coercedInteger = (max = 2147483647) => z.union([queryInteger(max), z.number().int().min(1).max(max)]).transform(Number);
export const categoryQuery = z.string().max(15).regex(/^(root|sub):\d+$/, "Category must be root:id or sub:id")
  .refine(value => Number(value.split(":")[1]) >= 1 && Number(value.split(":")[1]) <= 2147483647, "Invalid category ID");
export const searchQuery = z.string().trim().max(200).optional();
export const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm (00:00–23:59)");
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine(value => value.slice(0, 4) !== "0000" && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, "Invalid calendar date");

export function withDateRange(schema, from = "date_from", to = "date_to") {
  return schema.refine(data => !data[from] || !data[to] || data[from] <= data[to], {
    message: "Start date must not be after end date", path: [to],
  });
}

function decimal(max, scale, positive) {
  return z.number().finite().min(positive ? 10 ** -scale : 0).max(max)
    .refine(value => {
      const scaled = value * 10 ** scale;
      // Permit binary floating-point noise, but never silently round user-entered precision.
      return Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
    }, `Use at most ${scale} decimal places`);
}
export const money = (positive = false) => decimal(LIMITS.money, 2, positive);
export const stockQuantity = (positive = false) => decimal(LIMITS.stock, 3, positive);
export const unitCost = () => decimal(LIMITS.unitCost, 4, false);
export const orderQuantity = z.number().int().min(1).max(LIMITS.orderQuantity);
