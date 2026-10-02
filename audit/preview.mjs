// Isolated public UI fixture. No application imports, credentials, DB, or external API calls.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "ui-dist");
const requests = [];
let failure = false;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:5189");
  requests.push({ method: req.method, path: url.pathname, at: new Date().toISOString() });
  fs.writeFileSync(path.join(import.meta.dirname, "ui-requests.json"), JSON.stringify(requests, null, 2));
  if (url.pathname === "/__audit/failure") { failure = true; res.writeHead(302, { Location: "/order" }); return res.end(); }
  if (url.pathname === "/__audit/normal") { failure = false; res.writeHead(302, { Location: "/order" }); return res.end(); }
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/auth/me") { res.statusCode = 401; return res.end(JSON.stringify({ success: false, error: "UNAUTHORIZED", data: null })); }
    if (url.pathname === "/api/guest/menu" && !failure) return res.end(JSON.stringify({ success: true, data: { menu: [{ product_id: "123e4567-e89b-42d3-a456-426614174000", product_name: "Audit Coffee", category_name: "Beverages", subcategory_name: "Coffee", description: "Isolated test fixture", image_url: null, is_available: true, variants: [{ variant_id: 1, size_name: "Regular", price: 100, is_available: true }] }] } }));
    if (url.pathname === "/api/guest/settings") return res.end(JSON.stringify({ success: true, data: { storeName: "SmartCafe Audit Fixture", storeHours: null, acceptedPayments: ["cash", "gcash", "maya"], diningTables: { tables: [{ id: "t1", label: "Table 1", enabled: true }], takeoutEnabled: true } } }));
    res.statusCode = url.pathname.startsWith("/api/guest/orders/") ? 404 : 503;
    return res.end(JSON.stringify({ success: false, message: "Isolated audit simulated failure", error: "AUDIT_FIXTURE_FAILURE", data: null }));
  }
  let target;
  try { target = path.resolve(root, "." + decodeURIComponent(url.pathname)); } catch { res.statusCode = 400; return res.end(); }
  if (!target.startsWith(root + path.sep) && target !== root) { res.statusCode = 403; return res.end(); }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(root, "index.html");
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
  res.setHeader("Content-Type", mime[path.extname(target)] || "application/octet-stream");
  fs.createReadStream(target).pipe(res);
});
server.listen(5189, "127.0.0.1", () => console.log("Isolated audit UI fixture: http://127.0.0.1:5189"));
