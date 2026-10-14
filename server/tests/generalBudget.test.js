import { beforeAll, afterAll, expect, it, vi } from "vitest";
import express from "express";
vi.mock("../src/config/env.js", () => ({ env: { RATE_LIMIT_STORE: "memory" } }));
vi.mock("../src/config/prisma.js", () => ({ default: {} }));
import { generalLimiter, authLimiter, guestOrderLimiter } from "../src/middleware/rateLimit.middleware.js";
let server, base;
beforeAll(async () => {
  const app = express(); app.set("trust proxy", 1); app.use(generalLimiter);
  app.get("/read", (_req, res) => res.json({}));
  app.post("/auth", authLimiter, (_req, res) => res.json({}));
  app.post("/guest", guestOrderLimiter, (_req, res) => res.json({}));
  server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
async function request(ip, path = "/read") {
  const response = await fetch(base + path, { method: path === "/read" ? "GET" : "POST", headers: { "X-Forwarded-For": ip } });
  await response.arrayBuffer(); return response.status;
}
it("admits multiple staff reads past the old 500 cap without relaxing sensitive action limits", async () => {
  const ip = "203.0.113.30";
  for (let batch = 0; batch < 14; batch++) {
    const statuses = await Promise.all(Array.from({ length: 40 }, () => request(ip)));
    expect(statuses.every(status => status === 200)).toBe(true);
  }
  for (let i = 0; i < 10; i++) expect(await request(ip, "/guest")).toBe(200);
  expect(await request(ip, "/guest")).toBe(429);
  for (let i = 0; i < 100; i++) expect(await request(ip, "/auth")).toBe(200);
  expect(await request(ip, "/auth")).toBe(429);
}, 30000);
it("still blocks excessive general traffic at the new network cap", async () => {
  const ip = "203.0.113.31";
  for (let batch = 0; batch < 75; batch++) {
    const statuses = await Promise.all(Array.from({ length: 40 }, () => request(ip)));
    expect(statuses.every(status => status === 200)).toBe(true);
  }
  expect(await request(ip)).toBe(429);
}, 30000);
