/**
 * Realtime Server — WebSocket transport for invalidation events.
 *
 * WHY it exists: replaces client polling with server-pushed invalidations.
 * Sockets carry envelopes only ({ topic, entity, id, at }); clients refetch
 * through existing REST + TanStack Query, so the DB stays source of truth.
 *
 * Wire protocol (JSON, client ↔ server):
 * - C→S { type: "auth", token } — Bearer fallback when no session cookie.
 * - C→S { type: "subscribe", topic } / { type: "unsubscribe", topic }
 * - C→S { type: "ping" } → S→C { type: "pong" } (client heartbeat; the
 *   server also pings (WS_HEARTBEAT_MS) and terminates silent sockets.
 * - S→C { type: "event", topic, entity, id, at }
 * - S→C { type: "error", code, message } (auth/subscribe rejections)
 *
 * Guest tracking topics ("guest:<token>") are public but token-gated:
 * possession of the unguessable tracking token authorizes the subscription.
 */

import { WebSocketServer } from "ws";
import { env } from "../../config/env.js";
import { BUSINESS_TZ } from "../../config/time.js";
import { acceptsWebSocketOrigin } from "../../middleware/browserSecurity.middleware.js";
import { subscribe, unsubscribe, detachSocket, broadcast } from "./hub.js";
import { extractUpgradeToken, resolveUser, canSubscribe } from "./auth.js";
import { registerSessionSocket, unregisterSessionSocket, closeSessionSocket } from "./sessions.js";
import { realtimeLimits, upgradeClientKey, createAdmission, consumeMessage, closeOverloaded, sendBounded } from "./limits.js";
import { createAuthQueue } from "./authQueue.js";

export { broadcast };

const GUEST_TOPIC_RE = /^guest:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(socket, obj) {
  return sendBounded(socket, JSON.stringify(obj));
}

async function handleMessage(socket, raw, resolve, limits) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    send(socket, { type: "error", code: "BAD_MESSAGE", message: "Expected JSON" });
    return;
  }

  if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.type !== "string") {
    send(socket, { type: "error", code: "BAD_MESSAGE", message: "Expected a message object" }); return;
  }

  if (msg.type === "ping") {
    send(socket, { type: "pong" });
    return;
  }

  if (msg.type === "auth") {
    if (socket.__user) return;
    if (typeof msg.token !== "string" || !msg.token || msg.token.length > 4096) {
      closeOverloaded(socket, 4401, "invalid authentication"); return;
    }
    try {
      const user = await resolve(msg.token);
      if (socket.readyState !== 1 || socket.__closing) return;
      socket.__user = user;
      socket.__token = msg.token;
      registerSessionSocket(socket, socket.__user.id);
      send(socket, { type: "ready", user: { id: socket.__user.id, role: socket.__user.role } });
    } catch (err) {
      const unavailable = (err.statusCode ?? err.status ?? 503) >= 500;
      send(socket, { type: "error", code: unavailable ? "AUTH_UNAVAILABLE" : "UNAUTHORIZED", message: unavailable ? "Authentication temporarily unavailable" : "Session is invalid" });
      closeOverloaded(socket, unavailable ? 1013 : 4401, "authentication failed");
    }
    return;
  }

  if (msg.type === "subscribe") {
    const topic = msg.topic;
    if (typeof topic !== "string" || !topic || topic.length > 128) {
      send(socket, { type: "error", code: "BAD_MESSAGE", message: "Invalid topic" }); return;
    }
    if (socket.__topics.has(topic)) { send(socket, { type: "subscribed", topic }); return; }
    if (socket.__topics.size >= limits.subscriptions) {
      send(socket, { type: "error", code: "SUBSCRIPTION_LIMIT", message: "Too many subscriptions" }); return;
    }
    if (GUEST_TOPIC_RE.test(topic)) {
      subscribe(socket, topic);
      send(socket, { type: "subscribed", topic });
      return;
    }
    if (!socket.__user) {
      send(socket, { type: "error", code: "UNAUTHORIZED", message: "Authenticate first", topic });
      return;
    }
    try {
      const current = await resolve(socket.__token);
      if (socket.readyState !== 1 || socket.__closing || !socket.__user) return;
      socket.__user = current;
    } catch {
      closeSessionSocket(socket);
      return;
    }
    if (!topic || !canSubscribe(socket.__user, topic)) {
      send(socket, { type: "error", code: "FORBIDDEN", message: "Cannot subscribe to topic", topic });
      return;
    }
    subscribe(socket, topic);
    send(socket, { type: "subscribed", topic });
    return;
  }

  if (msg.type === "unsubscribe") {
    if (typeof msg.topic === "string" && msg.topic.length <= 128) unsubscribe(socket, msg.topic);
    return;
  }

  send(socket, { type: "error", code: "BAD_MESSAGE", message: "Unknown message type" });
}

/**
 * Attach the realtime server to an http.Server (shares port with Express).
 * Upgrade requests are auth-gated; the HTTP rate limiter does not apply to
 * upgrades (auth + heartbeat are the abuse controls here).
 * @param {import("http").Server} httpServer
 */
export function attachRealtimeServer(httpServer, { config = env, limits = realtimeLimits(config) } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: limits.payload, perMessageDeflate: false });
  const admission = createAdmission(limits);
  const pending = new Set();
  let draining = false;
  const auth = createAuthQueue(resolveUser, { capacity: limits.authQueries, timeoutMs: limits.authTimeoutMs });
  function rejectUpgrade(socket, status) {
    if (socket.destroyed) return;
    const phrase = status === 429 ? "Too Many Requests" : status === 403 ? "Forbidden" : status === 404 ? "Not Found" : "Service Unavailable";
    socket.end(`HTTP/1.1 ${status} ${phrase}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    const timer = setTimeout(() => socket.destroy(), 1000); timer.unref?.();
    socket.once("close", () => clearTimeout(timer));
  }
  const upgrade = async (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    // An HTTP upgrade awaiting auth has no ws close handler yet; reclaim a peer's FIN.
    socket.once("end", () => socket.destroy());
    if (draining) return rejectUpgrade(socket, 503);
    if (!acceptsWebSocketOrigin(req, config)) return rejectUpgrade(socket, 403);
    if ((req.url ?? "").split("?")[0] !== "/ws") return rejectUpgrade(socket, 404);
    let release;
    try { release = admission.reserve(upgradeClientKey(req, config)); } catch { return rejectUpgrade(socket, 403); }
    if (!release) return rejectUpgrade(socket, 429);
    pending.add(socket);
    let upgraded = false;
    const abandon = () => { pending.delete(socket); if (!upgraded) release(); };
    socket.once("close", abandon);
    const timeout = setTimeout(() => socket.destroy(), limits.authTimeoutMs); timeout.unref?.();
    // Cookie-first auth at upgrade (same-origin browsers send it
    // automatically). No cookie ≠ reject: the client may auth over the
    // socket (guest pages and cross-origin Bearer), but authed topics
    // stay closed until then.
    try {
      let user = null;
      const token = extractUpgradeToken(req);
      if (token && token.length > 4096) return rejectUpgrade(socket, 403);
      if (token) {
        try { user = await auth.resolve(token, () => !draining && !socket.destroyed && socket.writable); } catch (error) {
          if ((error.statusCode ?? error.status ?? 503) >= 500) return rejectUpgrade(socket, 503);
        }
      }
      if (socket.destroyed || !socket.writable || draining) return socket.destroy();
      wss.handleUpgrade(req, socket, head, ws => {
        upgraded = true; ws.once("close", release);
        wss.emit("connection", ws, req, user, token);
      });
    } catch { socket.destroy(); }
    finally {
      clearTimeout(timeout); pending.delete(socket);
      if (!upgraded) release();
    }
  };
  httpServer.on("upgrade", upgrade);

  wss.on("connection", (socket, _req, user, token) => {
    socket.__topics = new Set();
    socket.__maxBuffered = limits.buffered;
    socket.__user = user || null;
    socket.__token = user ? token : null;
    if (user) registerSessionSocket(socket, user.id);
    socket.__alive = true;
    socket.on("pong", () => {
      if (!socket.__closing && budget()) socket.__alive = true;
    });
    const queue = [];
    let processing = false;
    async function processQueue() {
      if (processing) return;
      processing = true;
      try {
        while (queue.length && socket.readyState === 1 && !socket.__closing) {
          await handleMessage(socket, queue.shift(), token => auth.resolve(token, () => !draining && socket.readyState === 1 && !socket.__closing), limits);
        }
      } catch { closeOverloaded(socket, 1011, "message processing failed"); }
      finally { processing = false; if (socket.readyState !== 1 || socket.__closing) queue.length = 0; }
    }
    const budget = () => {
      if (consumeMessage(socket, limits.messages)) return true;
      closeOverloaded(socket); return false;
    };
    socket.on("ping", budget);
    socket.on("message", (raw, binary) => {
      if (socket.__closing || !budget()) return;
      if (binary) { closeOverloaded(socket, 1003, "text messages required"); return; }
      if (queue.length >= limits.pendingMessages) { closeOverloaded(socket); return; }
      queue.push(raw); void processQueue();
    });
    const cleanup = () => { socket.__closing = true; queue.length = 0; detachSocket(socket); unregisterSessionSocket(socket); };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
    if (socket.__user) {
      send(socket, {
        type: "ready",
        user: { id: socket.__user.id, role: socket.__user.role },
      });
    } else {
      send(socket, { type: "hello", message: "Authenticate to subscribe to authed topics" });
    }
  });

  let validationFlight;
  async function revalidateSessions() {
    const iterator = wss.clients.values();
    async function worker() {
      for (const socket of iterator) {
        if (draining || socket.readyState !== 1 || socket.__closing || !socket.__user) continue;
        try {
          const user = await auth.resolve(socket.__token, () => !draining && socket.readyState === 1 && !socket.__closing);
          if (socket.readyState === 1 && !socket.__closing && socket.__user) socket.__user = user;
        } catch (error) {
          // Capacity pressure defers an idle check; invalid/failed sessions are closed.
          if (error.code !== "AUTH_BUSY") closeSessionSocket(socket);
        }
      }
    }
    // Scan with a fixed worker count instead of firing a query for every connected device.
    await Promise.all(Array.from({ length: Math.min(4, limits.authQueries) }, () => worker()));
  }
  const heartbeat = setInterval(() => {
    admission.prune();
    if (!validationFlight) validationFlight = revalidateSessions().finally(() => { validationFlight = null; });
    for (const socket of wss.clients) {
      if (socket.__closing || socket.readyState !== 1) continue;
      if (socket.__alive === false) {
        detachSocket(socket);
        try {
          socket.terminate();
        } catch {
          // already gone
        }
        continue;
      }
      socket.__alive = false;
      try {
        socket.ping();
      } catch {
        detachSocket(socket);
      }
    }
  }, config.WS_HEARTBEAT_MS ?? 25000);
  heartbeat.unref?.();

  console.log(`[realtime] WebSocket ready on /ws (business tz ${BUSINESS_TZ})`);
  return { wss, broadcast, stats: () => ({ ...admission.stats(), ...auth.stats(), pending: pending.size }), stop() {
    draining = true; clearInterval(heartbeat); auth.stop();
    for (const socket of pending) socket.destroy();
    // Keep the upgrade listener until HTTP closes so late upgrades receive a bounded 503.
    for (const socket of wss.clients) { detachSocket(socket); unregisterSessionSocket(socket); closeOverloaded(socket, 1001, "server shutting down"); }
  } };
}
