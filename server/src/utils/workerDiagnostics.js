const codes = new Set(["ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT",
  "08000", "08003", "08006", "53300", "53400", "57014", "57P01", "28P01", "42501", "42P01", "42703", "40001", "40P01",
  "P1001", "P1002", "P1017", "P2024", "P2028"]);

/** Only classified codes leave this boundary; never log SQL, connection strings or raw errors. */
export function workerFailureCode(error) {
  const chain = [error, error?.cause, error?.meta?.driverAdapterError?.cause, ...(Array.isArray(error?.errors) ? error.errors.slice(0, 3) : [])];
  for (const item of chain) if (codes.has(item?.code)) return item.code;
  const message = String(error?.message ?? "");
  if (/timeout exceeded when trying to connect|connection acquisition timeout/i.test(message)) return "DB_POOL_TIMEOUT";
  if (/connection terminated|connection closed/i.test(message)) return "DB_CONNECTION_CLOSED";
  return "UNCLASSIFIED";
}

export function createWorkerFailureReporter({ warn = value => console.warn(value), now = Date.now } = {}) {
  const last = new Map();
  return (worker, error) => {
    const code = workerFailureCode(error), key = `${worker}:${code}`, time = now();
    if (last.has(key) && time - last.get(key) < 60000) return;
    last.set(key, time);
    warn(JSON.stringify({ event: "background_worker_deferred", worker, code, retrying: true }));
  };
}
export const reportWorkerFailure = createWorkerFailureReporter();
