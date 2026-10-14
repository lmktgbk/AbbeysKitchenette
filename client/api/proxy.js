// Vercel-only transport: credentials and IP attestations never enter the Vite bundle.
export const config = { runtime: "edge" };

const fail = (status, message) => Response.json({ success: false, message, error: "API_PROXY_UNAVAILABLE", data: null }, { status, headers: { "Cache-Control": "no-store" } });

export default async function proxy(request) {
  const origin = process.env.API_UPSTREAM_ORIGIN;
  const secret = process.env.API_PROXY_SECRET;
  if (!origin || !secret || secret.length < 32) return fail(503, "API proxy is not configured");
  const incoming = new URL(request.url);
  const paths = incoming.searchParams.getAll("path");
  if (paths.length !== 1 || !/^[a-zA-Z0-9_/-]+$/.test(paths[0])) return fail(400, "Invalid API path");
  const target = new URL(origin);
  if (target.protocol !== "https:" || target.username || target.password || target.pathname !== "/" || target.search || target.hash) return fail(503, "Invalid API upstream");
  target.pathname = `/api/${paths[0]}`;
  incoming.searchParams.delete("path");
  target.search = incoming.searchParams.toString();
  // Vercel overwrites this header at its ingress; never accept a browser's custom IP header.
  const ip = request.headers.get("x-forwarded-for");
  if (!ip || ip.includes(",") || ip.includes("\n")) return fail(503, "Client address unavailable");
  const timestamp = String(Date.now());
  const payload = [request.method, target.pathname + target.search, timestamp, ip].join("\n");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const headers = new Headers();
  for (const name of ["content-type", "accept", "origin", "authorization", "x-smartcafe-request", "idempotency-key"]) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  const cookies = (request.headers.get("cookie") ?? "").split(";").filter(cookie => /^\s*(token|login_challenge)=/.test(cookie)).join(";");
  if (cookies) headers.set("cookie", cookies);
  headers.set("x-smartcafe-proxy-ip", ip);
  headers.set("x-smartcafe-proxy-time", timestamp);
  headers.set("x-smartcafe-proxy-signature", signature);
  try {
    const response = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual", signal: AbortSignal.timeout(120000) });
    const outgoing = new Headers();
    for (const name of ["content-type", "content-disposition", "retry-after"]) if (response.headers.has(name)) outgoing.set(name, response.headers.get(name));
    for (const cookie of response.headers.getSetCookie()) outgoing.append("set-cookie", cookie);
    outgoing.set("cache-control", "private, no-store");
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    return fail(502, "Cannot reach the API. Please try again shortly.");
  }
}
