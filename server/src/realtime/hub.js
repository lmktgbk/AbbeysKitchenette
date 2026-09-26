/**
 * Realtime Hub — in-process topic pub/sub for WebSocket events.
 *
 * WHY it exists: single fan-out point so service-layer mutations notify
 * connected devices without polling. Single-server assumption (same as the
 * automation scheduler): topics live in this process. If the app ever goes
 * multi-instance, replace `local` with a Redis pub/sub adapter behind this
 * same interface — callers (broadcast/subscribe) must not change.
 *
 * Contract (shared with client/src/realtime/socket.js):
 * - Sockets carry INVALIDATIONS, never data: { topic, entity, id, at }.
 *   Clients refetch through existing REST + TanStack Query endpoints, so
 *   dropped/duplicated/reordered messages cannot corrupt any screen.
 * - Slow clients are skipped, never buffered: on reconnect the client
 *   refetches (invalidation on resync), so no backlog can grow here.
 */

const topics = new Map(); // topic -> Set<ws>

function getSet(topic, create = false) {
  let set = topics.get(topic);
  if (!set && create) {
    set = new Set();
    topics.set(topic, set);
  }
  return set;
}

export function subscribe(socket, topic) {
  getSet(topic, true).add(socket);
  socket.__topics.add(topic);
}

export function unsubscribe(socket, topic) {
  getSet(topic)?.delete(socket);
  socket.__topics.delete(topic);
  if (getSet(topic)?.size === 0) topics.delete(topic);
}

export function detachSocket(socket) {
  for (const topic of [...(socket.__topics ?? [])]) unsubscribe(socket, topic);
}

/**
 * Fan out an invalidation envelope to a topic's subscribers.
 * Slow/closed sockets are skipped and pruned — never awaited, never queued.
 * @param {string} topic
 * @param {object} [event] - { entity?, id? }
 * @returns {number} - sockets reached
 */
export function broadcast(topic, event = {}) {
  const set = getSet(topic);
  if (!set?.size) return 0;
  const payload = JSON.stringify({
    type: "event",
    topic,
    entity: event.entity ?? null,
    id: event.id ?? null,
    at: new Date().toISOString(),
  });
  let reached = 0;
  for (const socket of [...set]) {
    if (socket.readyState !== 1) {
      detachSocket(socket);
      continue;
    }
    try {
      socket.send(payload);
      reached += 1;
    } catch {
      detachSocket(socket);
    }
  }
  return reached;
}

/** For tests/health: topic census without exposing sockets. */
export function topicStats() {
  const stats = {};
  for (const [topic, set] of topics) stats[topic] = set.size;
  return stats;
}

/** Test-only: reset all subscriptions (isolates test cases). */
export function __reset() {
  topics.clear();
}
