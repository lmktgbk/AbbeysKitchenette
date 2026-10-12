import { AppError } from "../../middleware/errorHandler.middleware.js";

/** Use one configured provider for every feature. A lost acknowledgement must
 * remain unconfirmed: retrying through SMTP could deliver the same OTP twice.
 */
export function createEmailDelivery(config, { request = fetch, smtp = async () =>
  (await import("../../config/nodemailer.js")).default } = {}) {
  return async ({ to, subject, html, attachments }) => {
    if (config.EMAIL_PROVIDER !== "brevo") {
      return (await smtp()).sendMail({
        from: { name: config.EMAIL_FROM_NAME, address: config.EMAIL_FROM },
        to, subject, html, ...(attachments?.length ? { attachments } : {}),
      });
    }

    // Reports already supply PDF buffers. Do not allow provider-side URL fetching
    // or silently drop unsupported attachments during the transport conversion.
    const attachment = attachments?.map(({ filename, content }) => {
      if (!filename || !Buffer.isBuffer(content)) throw new Error("Email attachments require a filename and Buffer content");
      return { name: filename, content: content.toString("base64") };
    });
    try {
      const response = await request("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": config.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          sender: { name: config.EMAIL_FROM_NAME, email: config.EMAIL_FROM },
          to: (Array.isArray(to) ? to : [to]).map(email => ({ email })),
          subject, htmlContent: html, ...(attachment?.length ? { attachment } : {}),
        }),
      });
      if (!response.ok) throw new Error("Provider rejected email");
      const result = await response.json();
      if (typeof result.messageId !== "string" || !result.messageId) throw new Error("Provider acknowledgement missing");
      return { messageId: result.messageId };
    } catch {
      // Provider bodies and raw transport errors can expose recipients or payloads.
      // Existing auth/report callers record this as unconfirmed and clean up OTPs.
      throw new AppError(503, "Email could not be sent. Please try again shortly.", "EMAIL_DELIVERY_UNAVAILABLE");
    }
  };
}
