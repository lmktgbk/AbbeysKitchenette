// Stable object ordering lets equivalent JSON payloads share a request digest.
// Array order remains significant because it identifies individual order lines.
/**
 * Serialize JSON-compatible submission data identically in browser and Node.
 * Object keys are sorted recursively; array order remains part of the identity.
 * This normalizes serialization only, not business values or authorization.
 */
export function canonicalJson(value) {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      // The replacer visits nested objects too, so nested key insertion order cannot change the digest.
      return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
    }
    return entry;
  });
}
