// Read-only source inventory. Writes only audit artifacts, never loads application config.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const out = import.meta.dirname;
const app = fs.readFileSync(path.join(root, "server/src/app.js"), "utf8");
const mounts = [...app.matchAll(/app\.use\("([^"]+)",\s*(\w+)\)/g)];
const imports = new Map([...app.matchAll(/import\s+(\w+)\s+from\s+"([^"]+)"/g)].map(m => [m[1], m[2]]));
const rows = [];
for (const [, prefix, name] of mounts) {
  if (!imports.has(name)) continue;
  const file = path.resolve(root, "server/src", imports.get(name));
  const raw = fs.readFileSync(file, "utf8");
  const text = raw.replace(/\/\*[\s\S]*?\*\//g, s => s.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, s => " ".repeat(s.length));
  const global = [...text.matchAll(/router\.use\(([^;]+)\);/g)].map(m => m[1]).join(" ");
  for (const m of text.matchAll(/router\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g)) {
    let end = m.index + m[0].length, depth = 1, quote = null, escaped = false;
    for (; end < text.length; end++) {
      const c = text[end];
      if (quote) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === quote) quote = null; continue; }
      if ('"\'`'.includes(c)) quote = c;
      else if (c === "(") depth++;
      else if (c === ")" && --depth === 0) break;
    }
    const body = text.slice(m.index, end + 1);
    const guards = global + " " + body;
    const roles = [...guards.matchAll(/authorize\(([^)]+)\)/g)].map(x => x[1].replace(/["']/g, "")).join("; ") || "none explicit";
    const validation = [...body.matchAll(/(validate(?:Query|Params)?)\(([^)]+)\)/g)].map(x => `${x[1]}(${x[2]})`).join(", ") || "none explicit";
    rows.push({ method: m[1].toUpperCase(), endpoint: prefix + (m[2] === "/" ? "" : m[2]), auth: guards.includes("authenticate") ? "JWT + active DB user" : "public", roles, validation,
      limiter: "global 500/15m/IP" + [...body.matchAll(/\b(\w+Limiter)\b/g)].map(x => ` + ${x[1]}`).join(""),
      location: path.relative(root, file).replaceAll("\\", "/"), line: raw.slice(0, m.index).split("\n").length,
      live: "Not verified; no isolated PostgreSQL fixture available", body });
  }
}
fs.writeFileSync(path.join(out, "endpoint-inventory.json"), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(out, "endpoint-matrix.md"), "# API endpoint matrix\n\nStatic inspection of every Express route registration. Includes the promotions alias. Authentication and validation presence are not proof of correct business authorization. All rows still require integration tests with an isolated DB. Global JSON limit is Express default 100kb; no general output schema. Logging in production is error-only.\n\n| Method | Endpoint | Authentication | Roles | Input validation | Rate limit | Source | Live result |\n|---|---|---|---|---|---|---|---|\n" + rows.map(r => `| ${r.method} | ${r.endpoint} | ${r.auth} | ${r.roles} | ${r.validation} | ${r.limiter} | ${r.location}:${r.line} | ${r.live} |`).join("\n"));
const tracked = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const envFiles = tracked.filter(f => /(^|\/)\.env($|\.)/.test(f));
const historyEnv = execFileSync("git", ["-C", root, "log", "--all", "--format=", "--name-only", "--", "**/.env", ".env"], { encoding: "utf8" }).trim();
const candidates = [];
const patterns = [ ["private-key", /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/], ["credential-in-url", /postgres(?:ql)?:\/\/[^\s:'"/]+:[^\s@'"/]+@/], ["google-key", /AIza[0-9A-Za-z_-]{30,}/], ["github-token", /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/] ];
for (const f of tracked) {
  if (/lock\.json$|\.(?:png|jpg|jpeg|webp|gif|woff2|ico|pdf)$/.test(f)) continue;
  try { const lines = fs.readFileSync(path.join(root, f), "utf8").split("\n");
    lines.forEach((s, i) => patterns.forEach(([kind, re]) => { if (re.test(s)) candidates.push({ file: f, line: i + 1, kind }); }));
  } catch {}
}
const envMetadata = {};
for (const f of ["client/.env", "server/.env", "ml-service/.env"]) {
  try { const content = fs.readFileSync(path.join(root, f), "utf8");
    envMetadata[f] = content.split(/\r?\n/).filter(x => /^[A-Z][A-Z0-9_]*\s*=/.test(x)).map(x => {
      const key = x.slice(0, x.indexOf("=")).trim(); const val = x.slice(x.indexOf("=") + 1).trim();
      return { key, present: Boolean(val), publicBuildKey: key.startsWith("VITE_"), loopbackUrl: /localhost|127\.0\.0\.1/.test(val) };
    });
  } catch { envMetadata[f] = "missing"; }
}
const summary = { expressRegistrations: rows.length, uniqueEndpoints: new Set(rows.map(x => x.method + x.endpoint)).size, trackedEnvFiles: envFiles, envHistoryPaths: historyEnv.split(/\r?\n/).filter(Boolean), secretCandidateLocations: candidates, envMetadata, deploymentFiles: tracked.filter(x => /Docker|docker|\.github\/|vercel|render\.yaml|netlify|hosting\.json|railway/.test(x)) };
fs.writeFileSync(path.join(out, "inventory-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
