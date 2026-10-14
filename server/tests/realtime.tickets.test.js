import { afterEach, expect, it, vi } from "vitest";
import { issueRealtimeTicket, consumeRealtimeTicket } from "../src/infrastructure/realtime/tickets.js";
afterEach(() => vi.useRealTimers());
it("exchanges one opaque ticket once without revealing the session JWT", () => {
  const ticket = issueRealtimeTicket("private-http-session");
  expect(ticket).toMatch(/^rt_[a-f0-9]{64}$/);
  expect(ticket).not.toContain("private-http-session");
  expect(consumeRealtimeTicket(ticket)).toBe("private-http-session");
  expect(() => consumeRealtimeTicket(ticket)).toThrow("Realtime ticket expired");
});
it("rejects admission after thirty seconds", () => {
  vi.useFakeTimers(); const ticket = issueRealtimeTicket("session");
  vi.advanceTimersByTime(30001);
  expect(() => consumeRealtimeTicket(ticket)).toThrow("Realtime ticket expired");
});
