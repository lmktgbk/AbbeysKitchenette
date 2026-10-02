import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import useAuthStore from "../../client/src/features/auth/authStore.js";
import { submitOrder } from "../../client/src/features/orders/submission.js";

const entries = new Map();
beforeEach(() => {
  entries.clear();
  useAuthStore.setState({ user: { id: "operator-a" } });
  vi.stubGlobal("sessionStorage", { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const payload = { customer_name: "Fixture", items: [{ quantity: 1 }] };

describe("Browser order submission identity", () => {
  it("a lost response retries with the same key without storing customer data", async () => {
    const keys = [];
    await expect(submitOrder("walk-in", payload, async key => { keys.push(key); throw new Error("Connection dropped"); })).rejects.toThrow();
    expect([...entries.values()].join("")).not.toContain("Fixture");
    await submitOrder("walk-in", payload, async key => { keys.push(key); return {}; });
    expect(keys[0]).toBe(keys[1]);
    expect(entries.size).toBe(0);
  });
  it("concurrent same-payload calls share one HTTP request", async () => {
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new Uint8Array(32).buffer);
    const keys = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const send = async key => { keys.push(key); await pending; return {}; };
    const calls = [submitOrder("walk-in", payload, send), submitOrder("walk-in", payload, send)];
    await Promise.resolve();
    await Promise.resolve();
    release();
    await Promise.all(calls);
    expect(keys).toHaveLength(1);
  });
  it("changed details cannot replace an unresolved submission", async () => {
    await expect(submitOrder("walk-in", payload, async () => { throw new Error("Lost response"); })).rejects.toThrow();
    const send = vi.fn();
    await expect(submitOrder("walk-in", { ...payload, customer_name: "Other" }, send)).rejects.toThrow("previous submission may have succeeded");
    expect(send).not.toHaveBeenCalled();
  });
  it("definitive validation/conflict rejection permits a corrected submission", async () => {
    const keys = [];
    await expect(submitOrder("walk-in", payload, async key => { keys.push(key); throw { response: { status: 409, data: { error: "PRICE_CHANGED" } } }; })).rejects.toBeDefined();
    await submitOrder("walk-in", { ...payload, items: [{ quantity: 2 }] }, async key => { keys.push(key); return {}; });
    expect(keys[0]).not.toBe(keys[1]);
  });
  it("a new intentional sale after success gets a new key", async () => {
    const keys = [];
    const send = async key => { keys.push(key); return {}; };
    await submitOrder("walk-in", payload, send);
    await submitOrder("walk-in", payload, send);
    expect(keys[0]).not.toBe(keys[1]);
  });
  it("guest submissions work without an authenticated operator", async () => {
    useAuthStore.setState({ user: null });
    const send = vi.fn().mockResolvedValue({ guest_token: "fixture" });
    expect(await submitOrder("guest-order", payload, send)).toEqual({ guest_token: "fixture" });
    await expect(submitOrder("walk-in", payload, send)).rejects.toThrow("Sign in");
  });
  it("operator switch cannot reuse another operator's pending key", async () => {
    const keys = [];
    await expect(submitOrder("walk-in", payload, async key => { keys.push(key); throw new Error("Disconnected"); })).rejects.toThrow();
    useAuthStore.setState({ user: { id: "operator-b" } });
    await submitOrder("walk-in", payload, async key => { keys.push(key); return {}; });
    expect(keys[0]).not.toBe(keys[1]);
  });
});
