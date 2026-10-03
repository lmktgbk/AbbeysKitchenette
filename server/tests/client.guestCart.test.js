import { describe, it, expect } from "vitest";
import { CART_KEY, CART_TTL, cartIntent, readCart, writeCart, reconcileCart, sameCartQuote } from "../../client/src/features/landing/cart.js";

const productId = "123e4567-e89b-42d3-a456-426614174000";
const item = { product_id: productId, variant_id: 1, quantity: 2 };
const menu = [{ product_id: productId, product_name: "Coffee", is_available: true,
  variants: [{ variant_id: 1, size_name: "Regular", price: 100, is_available: true }] }];
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

describe("guest cart recovery", () => {
  it("survives a refresh with intent only; customer details, tokens and prices are discarded", () => {
    const store = storage();
    writeCart(store, [{ ...item, unit_price: 1, customer_name: "Private", guest_token: "secret" }], 1000);
    expect(readCart(store, 1001)).toEqual([item]);
    expect(store.getItem(CART_KEY)).not.toMatch(/Private|secret|unit_price/);
  });
  it("clears after confirmed success", () => {
    const store = storage(); writeCart(store, [item], 1000); writeCart(store, []);
    expect(store.getItem(CART_KEY)).toBeUndefined();
  });
  it.each(["broken", "null", "[]", JSON.stringify({ version: 2, savedAt: 1000, items: [item] })])("rejects malformed or incompatible draft %s", text => {
    expect(readCart({ getItem: () => text }, 1001)).toEqual([]);
  });
  it("rejects expired and future drafts", () => {
    const store = storage(); writeCart(store, [item], 1000);
    expect(readCart(store, 1000 + CART_TTL)).toEqual([]);
    expect(readCart(store, 999)).toEqual([]);
  });
  it("fails gracefully when storage is inaccessible", () => {
    const store = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } };
    expect(readCart(store)).toEqual([]);
    expect(() => writeCart(store, [item])).not.toThrow();
    expect(() => writeCart(store, [])).not.toThrow();
  });
  it.each([0, -1, 1001, 1.5, "2", null])("rejects invalid quantity %s", quantity => {
    expect(cartIntent([{ ...item, quantity }])).toEqual([]);
  });
  it("bounds draft size, lines and duplicate variants", () => {
    expect(readCart({ getItem: () => "x".repeat(20001) })).toEqual([]);
    expect(cartIntent([item, item])).toEqual([item]);
    expect(cartIntent(Array.from({ length: 101 }, (_, index) => ({ ...item, variant_id: index + 1 })))).toHaveLength(100);
    expect(cartIntent([{ ...item, variant_id: 2147483648 }, { ...item, product_id: "invalid" }])).toEqual([]);
  });
});

describe("authoritative cart quote", () => {
  it("uses current server prices and preserves missing items for explicit removal", () => {
    const result = reconcileCart([{ ...item, unit_price: 1 }, { ...item, variant_id: 2 }], menu);
    expect(result[0]).toMatchObject({ unit_price: 100, available: true, product_name: "Coffee" });
    expect(result[1]).toMatchObject({ available: false, product_name: "Unavailable item", quantity: 2 });
  });
  it("rejects another product's variant", () => {
    expect(reconcileCart([{ ...item, product_id: "123e4567-e89b-42d3-a456-426614174001" }], menu)[0].available).toBe(false);
  });
  it.each([{ is_available: false }, { is_manually_deactivated: true }, { price: "invalid" }, { price: 0 }])("blocks unusable variant %j", change => {
    const changed = [{ ...menu[0], variants: [{ ...menu[0].variants[0], ...change }] }];
    expect(reconcileCart([item], changed)[0].available).toBe(false);
  });
  it("blocks an unavailable product and detects changed quotes before submission", () => {
    const first = reconcileCart([item], menu);
    expect(sameCartQuote(first, reconcileCart([item], menu))).toBe(true);
    expect(sameCartQuote(first, reconcileCart([item], [{ ...menu[0], is_available: false }]))).toBe(false);
    expect(sameCartQuote(first, reconcileCart([item], [{ ...menu[0], variants: [{ ...menu[0].variants[0], price: 125 }] }]))).toBe(false);
    expect(sameCartQuote(first, [])).toBe(false);
  });
});
