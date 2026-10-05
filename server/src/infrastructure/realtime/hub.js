/**
 * Process-local invalidation fanout. Business data is refetched through REST.
 * Deploy one backend replica until shared event delivery is implemented.
 * Slow consumers are disconnected at their buffer limit; subscription
 * acknowledgements refresh data missed during a connection outage.
 */

import { sendBounded } from "./limits.js";

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
    if (socket.readyState !== 1 || (socket.__user?.expiresAt && socket.__user.expiresAt <= Date.now())) {
      detachSocket(socket);
      continue;
    }
    try {
      if (sendBounded(socket, payload)) reached += 1;
      else detachSocket(socket);
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
