// Loopback-only browser fixture: no application backend, credentials, database or external delivery.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "ui-dist");
const productId = "123e4567-e89b-42d3-a456-426614174000";
const orderId = "123e4567-e89b-42d3-a456-426614174001";
let mode = "normal", price = 100, unavailable = false, uncertain = false;
let blockedAsset = null;
const submissions = new Map();
const observations = { menuReads: 0, attempts: 0, created: 0, replays: 0, assets: [] };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:5188");
  const json = (value, status = 200) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
  if (url.pathname === "/__audit/control" && req.method === "POST") {
    let body = ""; for await (const chunk of req) { body += chunk; if (body.length > 2000) return json({}, 413); }
    const options = JSON.parse(body || "{}");
    mode = options.mode ?? "normal"; price = options.price ?? 100; unavailable = options.unavailable ?? false; uncertain = options.uncertain ?? false;
    blockedAsset = options.blockedAsset ?? null;
    return json({ mode, price, unavailable, uncertain });
  }
  if (url.pathname === "/__audit/observations") return json(observations);
  if (url.pathname.startsWith("/assets/") && blockedAsset && url.pathname.includes(blockedAsset)) return json({}, 503);
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/auth/me") return json({ success: false }, 401);
    if (url.pathname === "/api/guest/settings") return json({ success: true, data: { storeHours: null,
      diningTables: { tables: [{ id: "t1", label: "Table 1", enabled: true }], takeoutEnabled: true } } });
    if (url.pathname === "/api/guest/menu") {
      observations.menuReads++;
      if (mode === "error") return json({ success: false, message: "Fixture menu unavailable" }, 503);
      return json({ success: true, data: { menu: mode === "empty" ? [] : [{ product_id: productId,
        product_name: "Fixture Coffee", category_name: "Beverages", description: "Isolated browser fixture", is_available: !unavailable,
        variants: [{ variant_id: 1, size_name: "Regular", price, is_available: !unavailable }] }] } });
    }
    if (url.pathname === "/api/guest/orders" && req.method === "POST") {
      observations.attempts++;
      let body = ""; for await (const chunk of req) { body += chunk; if (body.length > 100000) return json({}, 413); }
      const key = req.headers["idempotency-key"];
      if (submissions.has(key)) {
        const previous = submissions.get(key);
        if (previous.body !== body) return json({ success: false, error: "IDEMPOTENCY_CONFLICT" }, 409);
        observations.replays++; return json(previous.result);
      }
      const data = JSON.parse(body);
      const result = { success: true, data: { order: { order_id: orderId, order_number: "FIXTURE-001",
        guest_token: "123e4567-e89b-42d3-a456-426614174002", created_at: new Date().toISOString(),
        total_amount: data.items.reduce((sum, item) => sum + item.quantity * price, 0) } } };
      submissions.set(key, { body, result }); observations.created++;
      if (uncertain) { uncertain = false; return json({ success: false, message: "Fixture lost confirmation" }, 503); }
      return json(result, 201);
    }
    return json({ success: false, message: "Fixture resource not found" }, 404);
  }
  let target;
  try { target = path.resolve(root, "." + decodeURIComponent(url.pathname)); } catch { return json({}, 400); }
  if (target !== root && !target.startsWith(root + path.sep)) return json({}, 403);
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    if (url.pathname.startsWith("/assets/")) return json({}, 404);
    target = path.join(root, "index.html");
  }
  if (url.pathname.startsWith("/assets/")) observations.assets.push(url.pathname);
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
  res.setHeader("Content-Type", mime[path.extname(target)] ?? "application/octet-stream");
  fs.createReadStream(target).pipe(res);
});
server.listen(5188, "127.0.0.1", () => console.log("Guest fixture: http://127.0.0.1:5188/order"));
