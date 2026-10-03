import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("../../client/src/config/axios.js", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from "../../client/src/config/axios.js";
import { getGuestMenuRequest, placeGuestOrderRequest } from "../../client/src/features/orders/api.js";

beforeEach(() => {
  vi.clearAllMocks();
  const store = new Map();
  vi.stubGlobal("sessionStorage", { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) });
});
describe("guest menu transport", () => {
  it("accepts genuine empty menus and bounds network wait", async () => {
    api.get.mockResolvedValue({ data: { success: true, data: { menu: [] } } });
    expect(await getGuestMenuRequest()).toMatchObject({ data: { menu: [] } });
    expect(api.get).toHaveBeenCalledWith("/guest/menu", { params: {}, timeout: 10000 });
  });
  it.each([{}, { success: false, data: { menu: [] } }, { success: true, data: {} }])("does not disguise malformed responses as empty menus %j", data => {
    api.get.mockResolvedValue({ data });
    return expect(getGuestMenuRequest()).rejects.toThrow("menu could not be loaded");
  });
});
describe("guest submission confirmation", () => {
  it("retains the same replay key after an incomplete successful HTTP response", async () => {
    api.post.mockResolvedValueOnce({ data: { success: true, data: {} } })
      .mockResolvedValueOnce({ data: { success: true, data: { order: { order_id: "order", guest_token: "token" } } } });
    const payload = { customer_name: "Fixture", items: [] };
    await expect(placeGuestOrderRequest(payload)).rejects.toThrow("confirmation was incomplete");
    await expect(placeGuestOrderRequest(payload)).resolves.toMatchObject({ data: { order: { order_id: "order" } } });
    expect(api.post.mock.calls[0][2].headers["Idempotency-Key"]).toBe(api.post.mock.calls[1][2].headers["Idempotency-Key"]);
    expect(sessionStorage.getItem("smartcafe:submission:guest:guest-order")).toBeUndefined();
  });
});
