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
import { env } from "../config/env.js";
import { BUSINESS_TZ } from "../config/time.js";
import { subscribe, unsubscribe, detachSocket, broadcast } from "./hub.js";
import { extractUpgradeToken, resolveUser, canSubscribe } from "./auth.js";
import { registerSessionSocket, unregisterSessionSocket, closeSessionSocket } from "./sessions.js";

export { broadcast };

const GUEST_TOPIC_RE = /^guest:[0-9a-fA-F-]{36}$/;

function send(socket, obj) {
  if (socket.readyState !== 1) return false;
  try {
    socket.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

async function handleMessage(wss, socket, raw) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    send(socket, { type: "error", code: "BAD_MESSAGE", message: "Expected JSON" });
    return;
  }

  if (msg.type === "ping") {
    send(socket, { type: "pong" });
    return;
  }

  if (msg.type === "auth") {
    if (socket.__user) return;
    try {
      socket.__user = await resolveUser(msg.token);
      socket.__token = msg.token;
      registerSessionSocket(socket, socket.__user.id);
      send(socket, { type: "ready", user: { id: socket.__user.id, role: socket.__user.role } });
    } catch (err) {
      send(socket, { type: "error", code: err.code || "UNAUTHORIZED", message: err.message });
      socket.close(4401, "unauthorized");
    }
    return;
  }

  if (msg.type === "subscribe") {
    const topic = String(msg.topic || "");
    if (GUEST_TOPIC_RE.test(topic)) {
      subscribe(socket, topic);
      send(socket, { type: "subscribed", topic });
      return;
    }
    if (!socket.__user) {
      send(socket, { type: "error", code: "UNAUTHORIZED", message: "Authenticate first" });
      return;
    }
    try {
      const current = await resolveUser(socket.__token);
      if (socket.readyState !== 1 || !socket.__user) return;
      socket.__user = current;
    } catch {
      closeSessionSocket(socket);
      return;
    }
    if (!topic || !canSubscribe(socket.__user, topic)) {
      send(socket, { type: "error", code: "FORBIDDEN", message: "Cannot subscribe to topic" });
      return;
    }
    subscribe(socket, topic);
    send(socket, { type: "subscribed", topic });
    return;
  }

  if (msg.type === "unsubscribe") {
    unsubscribe(socket, String(msg.topic || ""));
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
export function attachRealtimeServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = env.WS_HEARTBEAT_MS;

  httpServer.on("upgrade", async (req, socket, head) => {
    if (!req.url.startsWith("/ws")) {
      socket.destroy();
      return;
    }
    // Cookie-first auth at upgrade (same-origin browsers send it
    // automatically). No cookie ≠ reject: the client may auth over the
    // socket (guest pages and cross-origin Bearer), but authed topics
    // stay closed until then.
    let user = null;
    const token = extractUpgradeToken(req);
    try {
      user = await resolveUser(token);
    } catch {
      user = null;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, user, token);
    });
  });

  wss.on("connection", (socket, _req, user, token) => {
    socket.__topics = new Set();
    socket.__user = user || null;
    socket.__token = user ? token : null;
    if (user) registerSessionSocket(socket, user.id);
    socket.__alive = true;
    socket.on("pong", () => {
      socket.__alive = true;
    });
    socket.on("message", (raw) => handleMessage(wss, socket, raw).catch(() => closeSessionSocket(socket)));
    const cleanup = () => { detachSocket(socket); unregisterSessionSocket(socket); };
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

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      // Revalidate idle connections too; revocations from other instances are DB-backed.
      if (socket.__user && !socket.__revalidating) {
        socket.__revalidating = true;
        resolveUser(socket.__token).then(user => {
          if (socket.readyState === 1 && socket.__user) socket.__user = user;
        }).catch(() => closeSessionSocket(socket)).finally(() => { socket.__revalidating = false; });
      }
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
  }, heartbeatMs);
  heartbeat.unref?.();

  console.log(`[realtime] WebSocket ready on /ws (business tz ${BUSINESS_TZ})`);
  return { wss, broadcast, stop: () => clearInterval(heartbeat) };
}
