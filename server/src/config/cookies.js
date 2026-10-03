import { env } from "./env.js";

export function sessionCookieOptions(config = env) {
  return {
    httpOnly: true, secure: config.NODE_ENV === "production",
    sameSite: config.COOKIE_SAME_SITE ?? "strict", path: "/", maxAge: 8 * 60 * 60 * 1000,
  };
}
