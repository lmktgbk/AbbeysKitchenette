/** Five-minute request windows leave room for shared store networks. Password
 * and OTP attempt counters remain per account/challenge, not per router.
 * OTP expiry, resend cooldown and session lifetime are separate policies.
 */
export const SECURITY_POLICY = Object.freeze({
  windowMs: 5 * 60 * 1000,
  general: 3000, authentication: 100, login: 50, otpVerify: 50,
  otpResend: 20, recovery: 20, passwordReset: 20,
  accountFailures: 5, recoveryAccount: 3, emailChange: 5,
  guestOrder: 100, guestTrack: 600,
  passwordLockoutMinutes: 5,
});
