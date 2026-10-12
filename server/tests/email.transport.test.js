import { describe, expect, it, vi } from "vitest";
import { createEmailDelivery } from "../src/infrastructure/integrations/email.transport.js";
import { parseEnvironment } from "../src/config/env.schema.js";

const config = { EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "fixture-secret", EMAIL_FROM: "sender@example.com", EMAIL_FROM_NAME: "Shop" };
const message = { to: "recipient@example.com", subject: "Verification", html: "<p>fixture OTP</p>" };

describe("shared email delivery", () => {
  it("sends existing HTML and PDF buffers through Brevo without invoking SMTP", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: "accepted" }) });
    const smtp = vi.fn();
    const send = createEmailDelivery(config, { request, smtp });
    expect(await send({ ...message, attachments: [{ filename: "report.pdf", content: Buffer.from("PDF") }] })).toEqual({ messageId: "accepted" });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(options.headers["api-key"]).toBe(config.BREVO_API_KEY);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({ sender: { name: "Shop", email: config.EMAIL_FROM }, to: [{ email: message.to }], subject: message.subject, htmlContent: message.html, attachment: [{ name: "report.pdf", content: "UERG" }] });
    expect(smtp).not.toHaveBeenCalled();
  });

  it.each(["rejected", "timeout", "missing acknowledgement"])("fails safely on %s without retry or fallback", async failure => {
    const request = vi.fn(async () => {
      if (failure === "timeout") throw new Error("fixture-secret recipient@example.com");
      return { ok: failure !== "rejected", json: async () => ({}) };
    });
    const smtp = vi.fn();
    await expect(createEmailDelivery(config, { request, smtp })(message)).rejects.toMatchObject({ statusCode: 503, code: "EMAIL_DELIVERY_UNAVAILABLE", message: "Email could not be sent. Please try again shortly." });
    expect(request).toHaveBeenCalledTimes(1);
    expect(smtp).not.toHaveBeenCalled();
  });

  it("preserves SMTP attachment buffers when SMTP is selected", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "smtp" });
    const request = vi.fn();
    const attachments = [{ filename: "report.pdf", content: Buffer.from("PDF") }];
    await createEmailDelivery({ ...config, EMAIL_PROVIDER: "smtp" }, { request, smtp: async () => ({ sendMail }) })({ ...message, attachments });
    expect(sendMail).toHaveBeenCalledWith({ ...message, attachments, from: { name: "Shop", address: config.EMAIL_FROM } });
    expect(request).not.toHaveBeenCalled();
  });

  it("requires the API key and valid sender when Brevo is selected", () => {
    const base = { CLIENT_URL: "http://localhost:5173", JWT_SECRET: "x".repeat(32), JWT_EXPIRES_IN: "8h", DATABASE_URL: "postgresql://fixture/db", DIRECT_URL: "postgresql://fixture/db", ...config };
    expect(parseEnvironment(base).EMAIL_PROVIDER).toBe("brevo");
    expect(() => parseEnvironment({ ...base, BREVO_API_KEY: "" })).toThrow("BREVO_API_KEY");
    expect(() => parseEnvironment({ ...base, EMAIL_FROM: "Shop" })).toThrow("EMAIL_FROM");
    expect(parseEnvironment({ ...base, NODE_ENV: "production", CLIENT_URL: "https://client.example.com", API_PUBLIC_URL: "https://api.example.com", TRUST_PROXY_HOPS: "1", DATABASE_URL: "postgresql://fixture/db?sslmode=verify-full", DIRECT_URL: "postgresql://fixture/db?sslmode=verify-full" }).EMAIL_PROVIDER).toBe("brevo");
  });
});
