import proxyaddr from "proxy-addr";
import { ipKeyGenerator } from "express-rate-limit";
import { env } from "../../config/env.js";

/** Resolve process-local socket budgets while reserving database capacity for HTTP transactions. */
export function realtimeLimits(config = env) {
  return {
    connections: config.WS_MAX_CONNECTIONS ?? 256,
    perIp: config.WS_MAX_CONNECTIONS_PER_IP ?? 40,
    subscriptions: config.WS_MAX_SUBSCRIPTIONS ?? 16,
    payload: config.WS_MAX_PAYLOAD_BYTES ?? 8192,
    buffered: config.WS_MAX_BUFFERED_BYTES ?? 65536,
    messages: config.WS_MAX_MESSAGES_PER_10S ?? 40,
    authTimeoutMs: config.WS_AUTH_TIMEOUT_MS ?? 5000,
    // Reserve database headroom for checkout and other HTTP transactions.
    authQueries: Math.max(1, Math.min(4, Math.floor((config.DATABASE_POOL_SIZE ?? 10) / 2))),
    pendingMessages: 32, ipBuckets: 4096, upgradesPerMinute: 60, globalUpgradesPerMinute: 600,
  };
}

/** Derive the client IP using the same trusted proxy-hop policy as Express. */
export function upgradeClientKey(req, config = env) {
  // HTTP and upgrade requests must select the same client behind the verified ingress.
  return ipKeyGenerator(proxyaddr(req, (_, hop) => hop < (config.TRUST_PROXY_HOPS ?? 0)));
}

/** Limit upgrade attempts and live sockets; reserve returns an idempotent release callback or null. */
export function createAdmission(limits, now = Date.now) {
  const clients = new Map();
  let active = 0, globalWindow = 0, globalAttempts = 0;
  function prune() {
    const time = now();
    for (const [key, bucket] of clients) if (!bucket.active && time >= bucket.resetAt) clients.delete(key);
  }
  return {
    reserve(key) {
      const time = now();
      if (time >= globalWindow) { globalWindow = time + 60000; globalAttempts = 0; }
      if (++globalAttempts > limits.globalUpgradesPerMinute) return null;
      let bucket = clients.get(key);
      if (!bucket) {
        if (clients.size >= limits.ipBuckets) { prune(); if (clients.size >= limits.ipBuckets) return null; }
        bucket = { active: 0, attempts: 0, resetAt: time + 60000 }; clients.set(key, bucket);
      }
      if (time >= bucket.resetAt) { bucket.attempts = 0; bucket.resetAt = time + 60000; }
      // Rejected attempts still consume the rate budget. Connection capacity
      // is consumed only by admitted sockets and released once on close/failure.
      if (++bucket.attempts > limits.upgradesPerMinute || active >= limits.connections || bucket.active >= limits.perIp) return null;
      active++; bucket.active++;
      let released = false;
      return () => { if (!released) { released = true; active--; bucket.active--; } };
    },
    prune,
    stats: () => ({ active, buckets: clients.size }),
  };
}

export function consumeMessage(socket, limit, now = Date.now()) {
  // A small token bucket permits subscription bursts while bounding sustained work.
  const bucket = socket.__messageBudget ??= { tokens: limit, at: now };
  bucket.tokens = Math.min(limit, bucket.tokens + Math.max(0, now - bucket.at) * limit / 10000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--; return true;
}

export function closeOverloaded(socket, code = 4408, reason = "realtime limit exceeded") {
  if (socket.__closing) return;
  socket.__closing = true;
  // A peer that ignores the close handshake must not retain its admission slot.
  const timer = setTimeout(() => socket.terminate(), 1000); timer.unref?.();
  socket.once("close", () => clearTimeout(timer));
  socket.close(code, reason);
}

/** Send an already-serialized payload only within the socket buffer budget; false means refetch/reconnect. */
export function sendBounded(socket, payload) {
  if (socket.readyState !== 1 || socket.__closing) return false;
  if ((socket.bufferedAmount ?? 0) + Buffer.byteLength(payload) > (socket.__maxBuffered ?? 65536)) {
    closeOverloaded(socket, 4408, "slow consumer"); return false;
  }
  try { socket.send(payload); return true; } catch { return false; }
}
