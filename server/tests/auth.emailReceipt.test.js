import { expect, it, vi } from "vitest";
const capture = vi.hoisted(() => vi.fn());
vi.mock("../src/config/prisma.js", () => ({ default: { $transaction: async fn => fn({}) } }));
vi.mock("../src/config/env.js", () => ({ env: {} }));
vi.mock("../src/infrastructure/effects/effects.js", () => ({ recordEffects: capture }));
vi.mock("../src/infrastructure/integrations/email.js", () => ({ sendEmail: async () => ({ messageId: "<provider-acknowledgement>" }) }));
import { sendAuthEmail } from "../src/modules/auth/auth.effects.js";
it("records provider acceptance and the message ID without OTP content", async () => {
  await sendAuthEmail({ to: "test@invalid.example", html: "private-code" }, { userId: "fixture", context: "login-otp", requestId: "challenge" });
  expect(capture.mock.calls[0][1].audit.details).toEqual({ context: "login-otp", requestId: "challenge", outcome: "provider-accepted", messageId: "<provider-acknowledgement>" });
  expect(JSON.stringify(capture.mock.calls)).not.toContain("private-code");
});
