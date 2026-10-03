import cors from "cors";
import { env } from "../config/env.js";

export function acceptsWebSocketOrigin(req, config = env) {
  const origin = req.headers.origin;
  return origin ? origin === config.CLIENT_URL : config.NODE_ENV !== "production";
}

export function browserCors(config = env) {
  return cors({ origin: (origin, callback) => callback(null, !origin || origin === config.CLIENT_URL), credentials: true, maxAge: 600 });
}

export function browserWriteGuard(config = env) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    // Cross-site cookies remove SameSite's CSRF barrier. Require both an exact
    // browser origin and a non-simple header before parsing or database work.
    const origin = req.get("Origin");
    if ((origin && origin !== config.CLIENT_URL) ||
        (config.NODE_ENV === "production" && (!origin || req.get("X-SmartCafe-Request") !== "1"))) {
      return res.status(403).json({ success: false, message: "Request origin could not be verified", error: "BROWSER_REQUEST_REJECTED", data: null });
    }
    next();
  };
}
