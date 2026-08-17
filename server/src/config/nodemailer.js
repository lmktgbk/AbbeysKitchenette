import nodemailer from "nodemailer";

/**
 * Unified mailer transport.
 * Priority: SMTP (nodemailer) > Gmail shortcut > Console logger (dev fallback).
 *
 * SMTP config via env:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM
 *
 * Gmail shortcut (if SMTP_HOST is not set but GMAIL_USER/GMAIL_APP_PASS are):
 *   GMAIL_USER, GMAIL_APP_PASS, EMAIL_FROM
 */
function createTransport() {
  // 1. SMTP direct (host/port/user/pass)
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // 2. Gmail shortcut (app password)
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS,
      },
    });
  }

  // 3. Dev fallback — log to console
  console.warn("[Mailer] No email transport configured. Emails will be logged.");
  return {
    sendMail: async ({ to, subject, html }) => {
      console.log("\n--- EMAIL (not sent — no transport configured) ---");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML preview: ${html.substring(0, 200)}...`);
      console.log("--- END EMAIL ---\n");
    },
  };
}

const transporter = createTransport();
export default transporter;
