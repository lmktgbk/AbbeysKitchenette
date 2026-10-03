import { detachSocket } from "./hub.js";
import { closeOverloaded } from "./limits.js";

const sessions = new Map();

export function registerSessionSocket(socket, userId) {
  if (socket.readyState !== 1 || socket.__closing) return;
  unregisterSessionSocket(socket);
  const sockets = sessions.get(userId) ?? new Set();
  sockets.add(socket);
  sessions.set(userId, sockets);
  socket.__sessionUserId = userId;
}

export function unregisterSessionSocket(socket) {
  const id = socket.__sessionUserId;
  const sockets = sessions.get(id);
  sockets?.delete(socket);
  if (sockets?.size === 0) sessions.delete(id);
  delete socket.__sessionUserId;
}

export function closeSessionSocket(socket) {
  detachSocket(socket);
  unregisterSessionSocket(socket);
  socket.__user = null;
  socket.__token = null;
  closeOverloaded(socket, 4401, "session invalidated");
}

// Database versions cover all instances; this closes local sockets immediately.
export function revokeLocalSessions(userId) {
  for (const socket of [...(sessions.get(userId) ?? [])]) closeSessionSocket(socket);
}
