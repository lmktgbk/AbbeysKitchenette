import { describe, it, expect, vi } from "vitest";
import express from "express";
import http from "node:http";
vi.mock("../src/config/prisma.js", () => ({ databasePool: {} }));
vi.mock("../src/services/mlClient.js", () => ({ fetchMl: vi.fn() }));
import { createReadiness, healthRoutes } from "../src/services/readiness.js";
import { createShutdown } from "../src/services/shutdown.js";

const make = (overrides = {}) => createReadiness({ checkDatabase: async () => true, checkMl: async () => true, timeoutMs: 30, cacheMs: 0, ...overrides });
describe("readiness", () => {
  it("keeps POS ready when optional ML fails", async () => {
    expect(await make({ checkMl: () => Promise.reject(new Error("offline")) }).check())
      .toMatchObject({ ready: true, degraded: true, checks: { database: true, mlService: false } });
  });
  it("fails closed when the database fails", async () => {
    expect((await make({ checkDatabase: async () => false }).check()).ready).toBe(false);
  });
  it("bounds stalled checks without accumulating underlying operations", async () => {
    const check = vi.fn(() => new Promise(() => {}));
    const probe = make({ checkDatabase: check });
    const start = Date.now();
    expect((await probe.check()).ready).toBe(false);
    expect(Date.now() - start).toBeLessThan(500);
    await probe.check();
    expect(check).toHaveBeenCalledTimes(1);
  });
  it("coalesces concurrent probes and caches successful checks", async () => {
    const check = vi.fn(async () => true);
    const probe = make({ checkDatabase: check, cacheMs: 5000 });
    await Promise.all(Array.from({ length: 20 }, () => probe.check()));
    await probe.check();
    expect(check).toHaveBeenCalledTimes(1);
    probe.beginShutdown();
    expect((await probe.check()).ready).toBe(false);
  });
  it("serves actual HTTP health routes and rejects business requests during drain", async () => {
    const probe = make({ checkMl: async () => false });
    const app = express().use(healthRoutes(probe));
    app.get("/orders", (req, res) => res.sendStatus(200));
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
      expect((await fetch(url + "/api/ready")).status).toBe(200);
      probe.beginShutdown();
      expect((await fetch(url + "/api/ready")).status).toBe(503);
      expect((await fetch(url + "/orders")).status).toBe(503);
      expect((await fetch(url + "/api/health")).status).toBe(200);
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});

describe("shutdown", () => {
  it("waits for workers before disconnecting and coalesces signals", async () => {
    let release;
    const work = new Promise(resolve => { release = resolve; });
    const disconnect = vi.fn(async () => {});
    const exit = vi.fn();
    const readiness = make();
    const stop = vi.fn(() => work);
    const shutdown = createShutdown({ readiness, getServer: () => null, getRealtime: () => null, workers: [{ stop }], disconnect, exit });
    const first = shutdown();
    expect(shutdown()).toBe(first);
    expect(readiness.isShuttingDown()).toBe(true);
    expect(disconnect).not.toHaveBeenCalled();
    release();
    await first;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
  it("forces termination after the grace deadline", async () => {
    const exit = vi.fn();
    const terminate = vi.fn();
    const shutdown = createShutdown({ readiness: make(), getServer: () => null,
      getRealtime: () => ({ stop() {}, wss: { clients: [{ close() {}, terminate }] } }),
      workers: [{ stop: () => new Promise(() => {}) }], disconnect: vi.fn(), exit, graceMs: 20 });
    shutdown();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(terminate).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
