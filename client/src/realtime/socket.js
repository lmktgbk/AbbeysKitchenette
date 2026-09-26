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
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
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
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    connect();
  }, backoffMs);
}

function connect() {
  if (!ENABLED || typeof WebSocket === "undefined") return;
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    backoffMs = 1000;
    setStatus("live");
    armHeartbeat();
    flushSubscriptions();
  };

  socket.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "pong") {
      clearTimeout(pongTimer);
      return;
    }
    if (msg.type !== "event") return;
    const handlers = subscriptions.get(msg.topic);
    if (!handlers) return;
    for (const fn of [...handlers]) {
      try {
        fn(msg);
      } catch (err) {
        console.warn("[realtime] subscriber dropped:", err?.message);
      }
    }
  };

  const down = () => {
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    if (started) scheduleReconnect();
  };
  socket.onclose = down;
  socket.onerror = () => {
    try {
      socket?.close();
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
  try {
    socket?.close();
  } catch {
    // already gone
  }
  socket = null;
}

/**
 * Subscribe to a topic. Returns an unsubscribe function.
 * Auto-connects on first use; resubscribes automatically on reconnect.
 */
export function subscribeRealtime(topic, handler) {
  startRealtime();
  if (!subscriptions.has(topic)) subscriptions.set(topic, new Set());
  subscriptions.get(topic).add(handler);
  send({ type: "subscribe", topic });
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
