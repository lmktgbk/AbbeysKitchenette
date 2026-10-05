import { describe, expect, it, vi } from "vitest";
vi.mock("../../client/src/config/axios.js", () => ({ default: {} }));
import { otpFailure, otpSecondsRemaining } from "../../client/src/features/auth/api.js";

describe("OTP failure and countdown contracts", () => {
  it("preserves the cooldown message and JSON timing without readable CORS headers", () => {
    expect(otpFailure({ response: { data: { message: "Please wait before requesting a new code",
      error: "OTP_RESEND_COOLDOWN", data: { retryAfterSeconds: 12 } } } })).toEqual({
      message: "Please wait before requesting a new code", retryAfterSeconds: 12, expired: false, rateLimited: false,
    });
  });
  it("distinguishes the shared auth limit from an expired login challenge", () => {
    expect(otpFailure({ response: { data: { error: "AUTH_RATE_LIMIT_EXCEEDED" }, headers: { "retry-after": "730" } } })).toMatchObject({ retryAfterSeconds: 730, rateLimited: true, expired: false });
    expect(otpFailure({ response: { data: { message: "Sign in again", error: "INVALID_CHALLENGE" } } })).toMatchObject({ message: "Sign in again", expired: true, retryAfterSeconds: 0 });
  });
  it("reports network failure without pretending the OTP is invalid", () => {
    expect(otpFailure({}).message).toContain("Check your connection");
  });
  it("ignores malformed retry timing", () => {
    for (const value of [-1, "bad", Infinity, null]) {
      expect(otpFailure({ response: { data: { data: { retryAfterSeconds: value } } } }).retryAfterSeconds).toBe(0);
    }
  });
  it("uses elapsed wall time including time spent in a background tab", () => {
    expect(otpSecondsRemaining(60_000, 0)).toBe(60);
    expect(otpSecondsRemaining(60_000, 59_999)).toBe(1);
    expect(otpSecondsRemaining(60_000, 60_000)).toBe(0);
    expect(otpSecondsRemaining(60_000, 900_000)).toBe(0);
  });
});
