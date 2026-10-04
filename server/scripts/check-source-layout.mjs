import { access } from "node:fs/promises";

/**
 * Verify the shared runtime dependency without reading secrets or connecting to services.
 * Resolve from this script, not the shell directory, so repository-root and
 * server-directory build commands check the same deployed layout.
 */
const sharedUrl = new URL("../../shared/canonicalJson.js", import.meta.url);
try {
  await access(sharedUrl);
} catch {
  throw new Error("Deployment source is incomplete: keep shared/canonicalJson.js alongside server/. Build from the repository root.");
}
const { canonicalJson } = await import(sharedUrl.href);
if (canonicalJson({ b: 2, a: 1 }) !== '{"a":1,"b":2}') {
  throw new Error("Shared submission serializer could not be verified");
}
console.log("Shared source layout and Node import verified. Hosted startup remains a separate acceptance check.");
