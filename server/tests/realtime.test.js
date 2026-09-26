import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  subscribe,
  unsubscribe,
  detachSocket,
  broadcast,
  topicStats,
  __reset,
} from "../src/realtime/hub.js";
import {
  extractUpgradeToken,
  canSubscribe,
} from "../src/realtime/auth.js";
import {
  ensureJobWatcher,
  watcherStats,
  __resetWatchers,
} from "../src/realtime/jobs.js";

vi.mock("../src/config/prisma.js", () => ({
  default: { user: { findUnique: vi.fn() } },
}));

function fakeSocket() {
  return {
    readyState: 1,
    __topics: new Set(),
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
  };
}

beforeEach(() => {
  __reset();
  vi.clearAllMocks();
});

describe("hub fanout", () => {
  it("reaches every subscriber on the topic only", () => {
    const a = fakeSocket();
    const b = fakeSocket();
    const other = fakeSocket();
    subscribe(a, "orders");
    subscribe(b, "orders");
    subscribe(other, "kitchen");
    const reached = broadcast("orders", { entity: "order", id: "1" });
    expect(reached).toBe(2);
    expect(a.sent).toHaveLength(1);
    expect(a.sent[0]).toMatchObject({ type: "event", topic: "orders", entity: "order", id: "1" });
    expect(a.sent[0].at).toBeTypeOf("string");
    expect(b.sent).toHaveLength(1);
    expect(other.sent).toHaveLength(0);
  });

  it("returns 0 and sends nothing with no subscribers", () => {
    expect(broadcast("orders", {})).toBe(0);
  });

  it("prunes dead sockets instead of buffering to them", () => {
    const live = fakeSocket();
    const dead = fakeSocket();
    dead.readyState = 3;
    subscribe(live, "orders");
    subscribe(dead, "orders");
    expect(broadcast("orders", {})).toBe(1);
    expect(topicStats()).toEqual({ orders: 1 });
  });

  it("unsubscribe and detach remove membership", () => {
    const a = fakeSocket();
    subscribe(a, "orders");
    subscribe(a, "kitchen");
    unsubscribe(a, "orders");
    expect(topicStats()).toEqual({ kitchen: 1 });
    detachSocket(a);
    expect(topicStats()).toEqual({});
  });
});

describe("upgrade token extraction", () => {
  it("reads the session cookie", () => {
    expect(extractUpgradeToken({ headers: { cookie: "foo=1; token=abc.def.ghi; bar=2" } })).toBe("abc.def.ghi");
  });

  it("falls back to Bearer subprotocol", () => {
    expect(
      extractUpgradeToken({ headers: { "sec-websocket-protocol": ["realtime", "Bearer xyz"] } }),
    ).toBe("xyz");
  });

  it("returns null with neither", () => {
    expect(extractUpgradeToken({ headers: {} })).toBeNull();
  });
});

describe("topic ACL", () => {
  const admin = { id: "u1", role: "admin" };
  const cashier = { id: "u2", role: "cashier" };
  const kitchen = { id: "u3", role: "kitchen" };

  it("lets staff roles hear ops topics, admins hear all", () => {
    for (const topic of ["orders", "kitchen", "inventory", "products", "shifts", "jobs:9"]) {
      expect(canSubscribe(cashier, topic)).toBe(true);
      expect(canSubscribe(kitchen, topic)).toBe(true);
      expect(canSubscribe(admin, topic)).toBe(true);
    }
    for (const topic of ["dashboard", "anomaly", "staff", "audit", "settings", "transactions"]) {
      expect(canSubscribe(admin, topic)).toBe(true);
      expect(canSubscribe(cashier, topic)).toBe(false);
    }
  });

  it("scopes notification topics to self (admins see all)", () => {
    expect(canSubscribe(cashier, "notifications:u2")).toBe(true);
    expect(canSubscribe(cashier, "notifications:u9")).toBe(false);
    expect(canSubscribe(admin, "notifications:u9")).toBe(true);
  });

  it("rejects unknown topics and missing users", () => {
    expect(canSubscribe(admin, "guest:abc")).toBe(false);
    expect(canSubscribe(admin, "nope")).toBe(false);
    expect(canSubscribe(null, "orders")).toBe(false);
  });
});

describe("resolveUser", () => {
  it("rejects missing and garbage tokens without touching the DB", async () => {
    const { resolveUser } = await import("../src/realtime/auth.js");
    const prisma = (await import("../src/config/prisma.js")).default;
    await expect(resolveUser(null)).rejects.toMatchObject({ status: 401 });
    await expect(resolveUser("garbage")).rejects.toMatchObject({ status: 401 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolves active users and rejects inactive ones", async () => {
    const { resolveUser } = await import("../src/realtime/auth.js");
    const { signToken } = await import("../src/config/jwt.js");
    const prisma = (await import("../src/config/prisma.js")).default;
    const token = signToken({ sub: "u2", role: "cashier" });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: "u2",
      name: "C",
      email: "c@x.ph",
      role: "cashier",
      isActive: true,
    });
    await expect(resolveUser(token)).resolves.toMatchObject({ id: "u2", role: "cashier" });
    prisma.user.findUnique.mockResolvedValueOnce({ id: "u2", role: "cashier", isActive: false });
    await expect(resolveUser(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects purpose-only tokens (e.g. password reset)", async () => {
    const { resolveUser } = await import("../src/realtime/auth.js");
    const { signToken } = await import("../src/config/jwt.js");
    const reset = signToken({ sub: "u2", purpose: "password-reset" }, "15m");
    await expect(resolveUser(reset)).rejects.toMatchObject({ status: 401 });
  });
});

describe("job watchers", () => {
  beforeEach(() => {
    __resetWatchers();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    __resetWatchers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("broadcasts once and stops when the job reaches terminal", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: "completed" }) });
    const sock = fakeSocket();
    subscribe(sock, "jobs:7");
    ensureJobWatcher("forecast", 7);
    await vi.advanceTimersByTimeAsync(0);
    expect(sock.sent).toHaveLength(1);
    expect(sock.sent[0]).toMatchObject({ type: "event", topic: "jobs:7", entity: "job", id: "7" });
    expect(watcherStats()).toEqual([]);
  });

  it("keeps watching while running and dedups concurrent arms", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: "running" }) });
    ensureJobWatcher("mba", 9);
    ensureJobWatcher("mba", 9);
    await vi.advanceTimersByTimeAsync(6000);
    expect(watcherStats()).toEqual(["mba:9"]);
    // Immediate tick + 2s/4s/6s ticks, single watcher (no double polling).
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("treats any non-running MBA status as terminal", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: "failed" }) });
    const sock = fakeSocket();
    subscribe(sock, "jobs:11");
    ensureJobWatcher("mba", 11);
    await vi.advanceTimersByTimeAsync(0);
    expect(sock.sent).toHaveLength(1);
    expect(watcherStats()).toEqual([]);
  });
});
