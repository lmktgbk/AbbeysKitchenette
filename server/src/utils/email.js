import transporter from "../config/nodemailer.js";
import { env } from "../config/env.js";

/**
 * Send an email
 * @param {object} options - { to, subject, html }
 * @returns {Promise} - nodemailer send result
 */
export async function sendEmail({ to, subject, html }) {
  const mailOptions = {
    from: `"Abbey's Kitchenette" <${env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
}

// ── Shared theme ─────────────────────────────────────────────
// Warm amber-orange palette mirroring the app UI primary
// (--primary oklch(0.6688 0.1174 50.1276) → #ce7e4f, as used by
// bg-primary buttons, pills, and active states app-wide). Flat hex +
// table layout + inline styles for Outlook/Gmail safety. No oklch,
// CSS vars, or dark-mode switching — email clients can't do those.
const THEME = {
  pageBg: "#fef9f0",
  cardBg: "#ffffff",
  tintBg: "#fbf0ea",
  accent: "#ce7e4f",
  ink: "#1c1008",
  muted: "#7c5c3e",
  border: "#e8d5c4",
};

/**
 * Shared professional base layout for all transactional emails.
 * @param {object} opts - { heading, introHtml, actionHtml, footNote }
 */
function baseEmailLayout({ heading, introHtml, actionHtml = "", footNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading} — Abbey's Kitchenette</title>
</head>
<body style="margin:0;padding:0;background-color:${THEME.pageBg};font-family:Inter,Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${THEME.pageBg};margin:0;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background-color:${THEME.cardBg};border:1px solid ${THEME.border};border-radius:12px;overflow:hidden;">
          <tr>
            <td bgcolor="${THEME.accent}" style="background-color:${THEME.accent};height:6px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 32px 8px;">
              <div style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:${THEME.accent};margin:0;">Abbey's Kitchenette</div>
              <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${THEME.muted};margin:6px 0 0;">POS &amp; Inventory System</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px 8px;">
              <h1 style="font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:${THEME.ink};margin:0 0 12px;">${heading}</h1>
              <div style="font-size:14px;line-height:1.7;color:${THEME.muted};margin:0;">${introHtml}</div>
            </td>
          </tr>
          ${actionHtml ? `<tr><td align="center" style="padding:16px 32px 8px;">${actionHtml}</td></tr>` : ""}
          <tr>
            <td align="center" style="padding:20px 32px 28px;border-top:1px solid ${THEME.border};">
              <p style="font-size:12px;line-height:1.6;color:${THEME.muted};margin:0;">${footNote}</p>
            </td>
          </tr>
        </table>
        <p style="font-size:11px;color:${THEME.muted};margin:16px 0 0;">Abbey's Kitchenette · Intelligent POS &amp; Inventory Management</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Primary CTA button — exact app bg-primary amber-orange (#ce7e4f),
 * white text, bgcolor fallback for Outlook, plus a plain-text URL
 * fallback for clients that strip buttons.
 */
function ctaButton(url, label) {
  return `<a href="${url}" style="display:inline-block;background-color:${THEME.accent};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:13px 36px;border-radius:8px;">${label}</a>
  <p style="font-size:12px;line-height:1.6;color:${THEME.muted};margin:16px 0 0;word-break:break-all;">If the button doesn't work, copy and paste this link:<br /><a href="${url}" style="color:${THEME.accent};text-decoration:underline;">${url}</a></p>`;
}

/**
 * Generate reset password email HTML
 * @param {string} resetUrl - URL with token (e.g., https://app.com/reset-password?token=xxx)
 * @returns {string} - HTML string
 */
export function generateResetPasswordEmail(resetUrl) {
  return baseEmailLayout({
    heading: "Reset Your Password",
    introHtml:
      "We received a request to reset your password. Click the button below to choose a new one.<br />This link expires in <strong>15 minutes</strong>.",
    actionHtml: ctaButton(resetUrl, "Reset Password"),
    footNote: "If you didn't request this, you can safely ignore this email.",
  });
}

/**
 * Generate staff invite (set-password) email HTML for new accounts.
 * @param {string} resetUrl - set-password URL with token
 * @param {string} [name] - staff first name for a personal greeting
 * @returns {string} - HTML string
 */
export function generateStaffInviteEmail(resetUrl, name = "") {
  const greeting = name ? `Hi ${name},<br />` : "";
  return baseEmailLayout({
    heading: "Set Your Password",
    introHtml:
      `${greeting}An account was created for you at Abbey's Kitchenette. Click the button below to set your own password and get started.<br />This link expires in <strong>15 minutes</strong>.`,
    actionHtml: ctaButton(resetUrl, "Set Password"),
    footNote:
      "If you weren't expecting this account, please contact your administrator.",
  });
}

/**
 * Generate OTP email HTML
 * @param {string} code - 6-digit OTP code
 * @returns {string} - HTML string
 */
export function generateOtpEmail(code) {
  return baseEmailLayout({
    heading: "Your Verification Code",
    introHtml: "Enter this 6-digit code to complete your login:",
    actionHtml: `<div style="display:inline-block;background-color:${THEME.tintBg};border:1px solid ${THEME.border};border-radius:8px;padding:16px 36px;font-size:32px;font-weight:bold;letter-spacing:8px;color:${THEME.ink};font-family:'Space Grotesk',Arial,Helvetica,sans-serif;">${code}</div>
      <p style="font-size:13px;color:${THEME.muted};margin:16px 0 0;">This code expires in <strong>10 minutes</strong>.</p>`,
    footNote: "If you didn't request this, you can safely ignore this email.",
  });
}
