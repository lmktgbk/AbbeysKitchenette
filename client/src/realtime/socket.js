/**
 * Realtime Socket — shared WebSocket singleton (native `ws` protocol).
 *
 * WHY it exists: one persistent connection per device replaces every client
 * poll timer. Sockets carry INVALIDATIONS only ({ topic, entity, id, at });
 * subscribers refetch through existing REST + TanStack Query, so the DB
 * stays source of truth and dropped/duplicated messages are harmless.
 *
 * Resilience: exponential-backoff reconnect (1s → 30s cap), client heartbeat
 * (ping every 20s, 5s pong timeout), auto-resubscribe on reconnect, and a
 * connection-status feed for the Live-dot. Set VITE_REALTIME=off to keep
 * today's polling behavior byte-for-byte (per-phase kill-switch).
 *
 * Usage:
 *   import { subscribeRealtime, realtimeStatus } from "@/realtime/socket";
 *   useEffect(() => subscribeRealtime("orders", () => {
 *     queryClient.invalidateQueries({ queryKey: ["orders"] });
 *   }), []);
 */

import { useSyncExternalStore } from "react";

const ENABLED = (import.meta.env.VITE_REALTIME ?? "on") !== "off";
const MAX_BACKOFF_MS = 30000;
const PING_MS = 20000;
const PONG_TIMEOUT_MS = 5000;

function wsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  // A separately hosted SPA must connect to its API, not the Vercel frontend host.
  const url = new URL(import.meta.env.VITE_API_URL || window.location.origin, window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws"; url.search = ""; url.hash = "";
  return url.toString();
}

// ── Connection status (external store so any component can read it) ──

let status = ENABLED ? "connecting" : "disabled"; // connecting | live | reconnecting | disabled
const statusListeners = new Set();

function setStatus(next) {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn();
}

export function realtimeStatus() {
  return status;
}

export function useRealtimeStatus() {
  return useSyncExternalStore(
    (fn) => {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    () => status,
  );
}

// ── Socket core ──

let socket = null;
let backoffMs = 1000;
let pingTimer = null;
let pongTimer = null;
let reconnectTimer = null;
let started = false;
// topic -> Set<handler>
const subscriptions = new Map();

function send(obj) {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function flushSubscriptions() {
  for (const topic of subscriptions.keys()) {
    send({ type: "subscribe", topic });
  }
}

function armHeartbeat() {
  clearInterval(pingTimer);
  clearTimeout(pongTimer);
  pingTimer = setInterval(() => {
    if (!send({ type: "ping" })) return;
    clearTimeout(pongTimer);
    pongTimer = setTimeout(() => {
      try {
        socket?.close();
      } catch {
        // will reconnect via onclose
      }
    }, PONG_TIMEOUT_MS);
  }, PING_MS);
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  setStatus("reconnecting");
  reconnectTimer = setTimeout(() => {
    if (!started) return;
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    connect();
  }, Math.min(MAX_BACKOFF_MS, backoffMs * (0.8 + Math.random() * 0.4)));
}

function connect() {
  if (!ENABLED || typeof WebSocket === "undefined") return;
  let current;
  try {
    current = new WebSocket(wsUrl());
    socket = current;
  } catch {
    scheduleReconnect();
    return;
  }

  current.onopen = () => {
    if (socket !== current || !started) return;
    backoffMs = 1000;
    setStatus("live");
    armHeartbeat();
    flushSubscriptions();
  };

  current.onmessage = (event) => {
    if (socket !== current || !started) return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
    if (msg.type === "pong") {
      clearTimeout(pongTimer);
      return;
    }
    const denied = msg.type === "error" && ["UNAUTHORIZED", "FORBIDDEN"].includes(msg.code);
    if (msg.type !== "event" && msg.type !== "subscribed" && !denied) return;
    const handlers = subscriptions.get(msg.topic);
    if (!handlers) return;
    for (const fn of [...handlers]) {
      try {
        // Subscription acknowledgement arrives after joining the server topic.
        // Refetch then so mutations missed while offline cannot leave stale screens.
        // A denied staff subscription also refreshes through REST, where session
        // expiry and role changes invoke the existing access/error handling.
        fn(msg.type === "event" ? msg : { type: "resync", topic: msg.topic });
      } catch (err) {
        console.warn("[realtime] subscriber dropped:", err?.message);
      }
    }
  };

  const down = () => {
    if (socket !== current) return;
    socket = null;
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    if (started) scheduleReconnect();
  };
  current.onclose = down;
  current.onerror = () => {
    if (socket !== current) return;
    try {
      current.close();
    } catch {
      // handled by onclose
    }
  };
}

export function startRealtime() {
  if (started || !ENABLED) return;
  started = true;
  setStatus("connecting");
  connect();
}

export function stopRealtime() {
  started = false;
  clearTimeout(reconnectTimer);
  clearInterval(pingTimer);
  clearTimeout(pongTimer);
  const previous = socket;
  socket = null;
  try {
    previous?.close();
  } catch {
    // already gone
  }
}

/**
 * Subscribe to a topic. Returns an unsubscribe function.
 * Auto-connects on first use; resubscribes automatically on reconnect.
 */
export function subscribeRealtime(topic, handler) {
  startRealtime();
  const first = !subscriptions.has(topic);
  if (first) subscriptions.set(topic, new Set());
  subscriptions.get(topic).add(handler);
  if (first) send({ type: "subscribe", topic });
  return () => {
    const set = subscriptions.get(topic);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      subscriptions.delete(topic);
      send({ type: "unsubscribe", topic });
    }
  };
}
