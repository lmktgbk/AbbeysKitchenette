import { env } from "../config/env.js";

/** Consume the body within the deadline; never forward the service key across redirects. */
export async function fetchMl(path, { method = "GET", body, timeoutMs = env.ML_REQUEST_TIMEOUT_MS ?? 10000 } = {}) {
  if (!/^[a-f0-9]{64}$/i.test(env.ML_SERVICE_KEY ?? "")) {
    throw new Error("ML service credential is not configured");
  }
  const base = new URL(env.FORECAST_URL ?? "http://127.0.0.1:8000");
  const url = new URL(path, base);
  if (!path.startsWith("/") || path.startsWith("//") || url.origin !== base.origin) {
    throw new Error("Invalid ML service path");
  }
  const response = await fetch(url, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "X-ML-Service-Key": env.ML_SERVICE_KEY, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // Service credentials and user sessions are separate authentication boundaries.
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    throw new Error("ML service authentication failed");
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { ok: false, status: response.status };
  }
  const data = await response.json();
  return { ok: true, status: response.status, json: async () => data };
}

export async function proxyMl(res, path, { serviceLabel, fallbackCode, okMessage, method, body, onData }) {
  try {
    const response = await fetchMl(path, { method, body });
    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: `${serviceLabel} service error: ${response.status}`, error: fallbackCode, data: null });
    }
    const data = await response.json();
    onData?.(data);
    return res.status(200).json({ success: true, message: okMessage, data });
  } catch (error) {
    console.error(`[${fallbackCode}] ${serviceLabel} service unavailable:`, error.name);
    return res.status(503).json({ success: false, message: `${serviceLabel} service is temporarily unavailable. Please try again later.`, error: `${serviceLabel.toUpperCase()}_SERVICE_UNAVAILABLE`, data: null });
  }
}
