import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ allowed: vi.fn(), placeOrder: vi.fn(), menu: vi.fn(), track: vi.fn() }));
vi.mock("../src/utils/ipCheck.js", () => ({ isStoreIP: mocks.allowed }));
vi.mock("../src/modules/guest/guest.service.js", () => ({ guestService: {
  placeOrder: mocks.placeOrder, getMenu: mocks.menu, getByToken: mocks.track,
} }));
vi.mock("../src/infrastructure/realtime/events.js", () => ({ emitOrderChanged: vi.fn() }));
vi.mock("../src/modules/settings/settings.repository.js", () => ({ settingsRepository: { find: vi.fn() } }));
import { guestController } from "../src/modules/guest/guest.controller.js";

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe("guest submission store boundary", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects an off-site submission before business writes or idempotency lookup", async () => {
    mocks.allowed.mockResolvedValue(false);
    const res = response();
    await guestController.placeOrder({ ip: "203.0.113.2", body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "STORE_IP_REQUIRED" }));
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("passes the trusted request IP and preserves the allowed submission payload", async () => {
    mocks.allowed.mockResolvedValue(true);
    mocks.placeOrder.mockResolvedValue({ order_id: "order" });
    const res = response();
    const items = [{ variant_id: "variant", quantity: 1 }];
    await guestController.placeOrder({ ip: "203.0.113.1", body: {
      customer_name: "Guest", table_number: "Table 1", items,
    }, get: () => "submission-key" }, res);
    expect(mocks.allowed).toHaveBeenCalledWith("203.0.113.1");
    expect(mocks.placeOrder).toHaveBeenCalledWith(expect.objectContaining({
      customerName: "Guest", tableNumber: "Table 1", items, idempotencyKey: "submission-key",
    }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("does not create an order when the whitelist cannot be read", async () => {
    mocks.allowed.mockRejectedValue(new Error("database unavailable"));
    await guestController.placeOrder({ ip: "203.0.113.1", body: {} }, response());
    expect(mocks.placeOrder).not.toHaveBeenCalled();
  });

  it("keeps menu and existing order tracking independent of the whitelist", async () => {
    mocks.menu.mockResolvedValue([]);
    mocks.track.mockResolvedValue({ order_id: "order" });
    await guestController.getMenu({}, response());
    await guestController.trackOrder({ params: { token: "tracking-token" } }, response());
    expect(mocks.allowed).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("tracking-token");
  });
});
