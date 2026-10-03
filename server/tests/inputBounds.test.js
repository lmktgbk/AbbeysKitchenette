import { describe, it, expect } from "vitest";
import * as orders from "../src/modules/orders/order.validation.js";
import * as ingredients from "../src/modules/ingredients/ingredient.validation.js";
import * as analytics from "../src/modules/analytics/analytics.validation.js";
import * as shifts from "../src/modules/shifts/shift.validation.js";
import { getProductsQuerySchema, createProductSchema } from "../src/modules/products/product.validation.js";
import { getStaffQuerySchema } from "../src/modules/staff/staff.validation.js";
import { getTransactionsQuerySchema } from "../src/modules/transactions/transaction.validation.js";
import { auditLogQuerySchema } from "../src/modules/auditLogs/auditLog.validation.js";
import { dashboardQuerySchema } from "../src/modules/dashboard/dashboard.validation.js";
import { notificationQuerySchema, cleanupSchema } from "../src/modules/notifications/notification.validation.js";
import { anomalyQuerySchema } from "../src/modules/anomalyDetection/anomalyDetection.validation.js";
import { forecastJobQuerySchema } from "../src/modules/forecasting/forecasting.validation.js";
import { createGuestOrderSchema } from "../src/modules/guest/guest.validation.js";
import { calendarDate, money, stockQuantity, unitCost } from "../src/utils/validation.js";
import { loadIngredientOptions } from "../../client/src/features/ingredients/options.js";

const id = "123e4567-e89b-42d3-a456-426614174000";
const item = { product_id: id, variant_id: 1, quantity: 1, unit_price: 10 };
const sale = { customer_name: "Cafe", table_number: "Takeout", amount_paid: 10, items: [item] };
const lists = { orders: orders.getOrdersQuerySchema, ingredients: ingredients.getIngredientsQuerySchema,
  batches: ingredients.getBatchesQuerySchema, history: ingredients.getHistoryQuerySchema,
  archived: ingredients.getArchivedQuerySchema, products: getProductsQuerySchema, staff: getStaffQuerySchema,
  transactions: getTransactionsQuerySchema, shifts: shifts.getShiftsQuerySchema, shiftOrders: shifts.getShiftOrdersQuerySchema,
  variants: analytics.getVariantProfitQuerySchema, ingredientProfit: analytics.getIngredientProfitQuerySchema,
  waste: analytics.getWasteDetailsQuerySchema, audits: auditLogQuerySchema, notifications: notificationQuerySchema, anomalies: anomalyQuerySchema };
describe("Input and query bounds", () => {
  for (const [name, schema] of Object.entries(lists)) {
    it(`${name}: accepts supported pages and rejects zero, junk, huge and repeated inputs`, () => {
      expect(schema.safeParse({ page: "1", limit: "100" }).success).toBe(true);
      for (const bad of ["0", "-1", "1.5", "junk", "1e3", "99999999999", ["1", "2"]]) {
        expect(schema.safeParse({ page: bad }).success).toBe(false);
        expect(schema.safeParse({ limit: bad }).success).toBe(false);
      }
      expect(schema.safeParse({ page: "1001" }).success).toBe(false);
      expect(schema.safeParse({ limit: "101" }).success).toBe(false);
    });
  }
  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "0000-01-01", "2026-1-01", "bad", "2026-10-03T00:00:00Z"])("rejects invalid calendar input %s", value => {
    expect(calendarDate.safeParse(value).success).toBe(false);
  });
  it("accepts real leap days and rejects reversed ranges across reporting routes", () => {
    expect(calendarDate.safeParse("2024-02-29").success).toBe(true);
    for (const schema of [orders.getOrdersQuerySchema, orders.getStatsQuerySchema, analytics.getAnalyticsQuerySchema,
      analytics.getExportQuerySchema, analytics.getTrendQuerySchema, shifts.getShiftStatsQuerySchema, getTransactionsQuerySchema]) {
      expect(schema.safeParse({ date_from: "2026-10-04", date_to: "2026-10-03" }).success).toBe(false);
    }
    expect(auditLogQuerySchema.safeParse({ startDate: "2026-10-04", endDate: "2026-10-03" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ dateFrom: "2026-10-04", dateTo: "2026-10-03" }).success).toBe(false);
  });
  it("rejects invalid time and oversized searches/IDs before queries", () => {
    expect(orders.getOrdersQuerySchema.safeParse({ time_from: "24:00" }).success).toBe(false);
    expect(orders.getOrdersQuerySchema.safeParse({ time_from: "12:99" }).success).toBe(false);
    expect(orders.getOrdersQuerySchema.safeParse({ time_from: "23:59" }).success).toBe(true);
    expect(getProductsQuerySchema.safeParse({ search: "x".repeat(201) }).success).toBe(false);
    expect(getProductsQuerySchema.safeParse({ category: "sub:2147483648" }).success).toBe(false);
    expect(orders.orderItemParamSchema.safeParse({ id, itemId: "2147483648" }).success).toBe(false);
    expect(forecastJobQuerySchema.safeParse({ jobId: ["12"] }).success).toBe(false);
    expect(cleanupSchema.safeParse({ days: true }).success).toBe(false);
  });
  it("checks storage precision, finite values and numeric boundaries without rounding inputs", () => {
    expect(money().safeParse(0.1 + 0.2).success).toBe(true);
    expect(money().safeParse(99999999.99).success).toBe(true);
    expect(stockQuantity().safeParse(9999999.999).success).toBe(true);
    expect(unitCost().safeParse(999999.9999).success).toBe(true);
    for (const bad of [Infinity, NaN, -1, 100000000, 1.005, 0.0000001]) expect(money().safeParse(bad).success).toBe(false);
    expect(stockQuantity().safeParse(0.0001).success).toBe(false);
    expect(unitCost().safeParse(0.00001).success).toBe(false);
  });
  it("bounds order work for guests, paid sales and pending edits", () => {
    for (const schema of [createGuestOrderSchema, orders.createOrderSchema, orders.updateOrderSchema, orders.fulfillOrderSchema]) {
      expect(schema.safeParse({ ...sale, items: Array.from({ length: 101 }, () => item) }).success).toBe(false);
      expect(schema.safeParse({ ...sale, items: [{ ...item, quantity: 1001 }] }).success).toBe(false);
    }
    expect(orders.createOrderSchema.safeParse(sale).success).toBe(true);
  });
  it("bounds nested product recipes/variants and catches computed restock overflow", () => {
    const variant = { size_name: "Regular", price: 10, recipes: [{ ingredient_id: id, quantity_needed: 0.001 }] };
    const product = { product_name: "Cafe", subcategory_id: 1, variants: [variant] };
    expect(createProductSchema.safeParse(product).success).toBe(true);
    expect(createProductSchema.safeParse({ ...product, variants: Array.from({ length: 51 }, () => variant) }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...product, variants: [{ ...variant, recipes: Array.from({ length: 101 }, () => variant.recipes[0]) }] }).success).toBe(false);
    expect(ingredients.restockIngredientSchema.safeParse({ quantity_added: 9999999, cost_per_unit: 999999 }).success).toBe(false);
  });
  it("loads every ingredient page, sorts names and passes cancellation through", async () => {
    const signal = new AbortController().signal, calls = [];
    const result = await loadIngredientOptions(async params => {
      calls.push(params);
      return { data: { ingredients: [{ ingredient_id: params.cursor ? "b" : "a", ingredient_name: params.cursor ? "Apple" : "Zucchini" }], next_cursor: params.cursor ? null : "next" } };
    }, signal);
    expect(result.data.ingredients.map(x => x.ingredient_id)).toEqual(["b", "a"]);
    expect(calls).toEqual([{ cursor: undefined, signal }, { cursor: "next", signal }]);
  });
  it("never substitutes an empty picker when a page fails or its cursor stalls", async () => {
    await expect(loadIngredientOptions(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    await expect(loadIngredientOptions(async () => ({ data: { ingredients: [], next_cursor: "same" } }))).rejects.toThrow("did not advance");
  });
});
