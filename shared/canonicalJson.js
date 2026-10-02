// Stable object ordering lets equivalent JSON payloads share a request digest.
// Array order remains significant because it identifies individual order lines.
export function canonicalJson(value) {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]]));
    }
    return entry;
  });
}
