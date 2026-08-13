import transporter from "../config/nodemailer.js";
import { env } from "../config/env.js";

/**
 * Send an email
 * @param {object} options - { to, subject, html }
 * @returns {Promise} - nodemailer send result
 */
export async function sendEmail({ to, subject, html }) {
  const mailOptions = {
    from: `"Abbey's Kitchenette" <${env.SMTP_EMAIL}>`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
}

/**
 * Generate reset password email HTML
 * @param {string} resetUrl - URL with token (e.g., https://app.com/reset-password?token=xxx)
 * @returns {string} - HTML string
 */
export function generateResetPasswordEmail(resetUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background-color: #1a1a1a; padding: 24px; text-align: center; }
        .header h1 { color: #f5a623; margin: 0; font-size: 20px; }
        .header p { color: #999999; margin: 4px 0 0; font-size: 12px; }
        .body { padding: 32px 24px; text-align: center; }
        .body h2 { color: #333333; font-size: 18px; margin-bottom: 16px; }
        .body p { color: #666666; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
        .btn { display: inline-block; background-color: #f5a623; color: #1a1a1a; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; font-size: 14px; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid #eeeeee; }
        .footer p { color: #999999; font-size: 12px; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Abbey's Kitchenette</h1>
          <p>POS & Inventory System</p>
        </div>
        <div class="body">
          <h2>Reset Your Password</h2>
          <p>Click the button below to reset your password. This link expires in 15 minutes.</p>
          <a href="${resetUrl}" class="btn">Reset Password</a>
        </div>
        <div class="footer">
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate OTP email HTML
 * @param {string} code - 6-digit OTP code
 * @returns {string} - HTML string
 */
export function generateOtpEmail(code) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background-color: #1a1a1a; padding: 24px; text-align: center; }
        .header h1 { color: #f5a623; margin: 0; font-size: 20px; }
        .header p { color: #999999; margin: 4px 0 0; font-size: 12px; }
        .body { padding: 32px 24px; text-align: center; }
        .body h2 { color: #333333; font-size: 18px; margin-bottom: 16px; }
        .body p { color: #666666; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
        .code { display: inline-block; background-color: #f4f4f4; color: #1a1a1a; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 32px; border-radius: 6px; margin-bottom: 24px; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid #eeeeee; }
        .footer p { color: #999999; font-size: 12px; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Abbey's Kitchenette</h1>
          <p>POS & Inventory System</p>
        </div>
        <div class="body">
          <h2>Your Verification Code</h2>
          <p>Enter this 6-digit code to complete your login:</p>
          <div class="code">${code}</div>
          <p>This code expires in 10 minutes.</p>
        </div>
        <div class="footer">
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate new PIN email HTML
 * @param {string} newPin - The new temporary PIN
 * @returns {string} - HTML string
 */
export function generateNewPinEmail(newPin) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
        .container { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background-color: #1a1a1a; padding: 24px; text-align: center; }
        .header h1 { color: #f5a623; margin: 0; font-size: 20px; }
        .header p { color: #999999; margin: 4px 0 0; font-size: 12px; }
        .body { padding: 32px 24px; text-align: center; }
        .body h2 { color: #333333; font-size: 18px; margin-bottom: 16px; }
        .body p { color: #666666; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
        .pin { display: inline-block; background-color: #f4f4f4; color: #1a1a1a; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 32px; border-radius: 6px; margin-bottom: 24px; }
        .footer { padding: 16px 24px; text-align: center; border-top: 1px solid #eeeeee; }
        .footer p { color: #999999; font-size: 12px; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Abbey's Kitchenette</h1>
          <p>POS & Inventory System</p>
        </div>
        <div class="body">
          <h2>Your New PIN</h2>
          <p>Your PIN has been reset. Use this temporary PIN to log in:</p>
          <div class="pin">${newPin}</div>
          <p>You will be asked to set a new PIN after logging in.</p>
        </div>
        <div class="footer">
          <p>If you didn't request this, please contact your administrator.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
