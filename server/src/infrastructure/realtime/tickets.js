import crypto from "node:crypto";
import { AppError } from "../../middleware/errorHandler.middleware.js";

// Short-lived admission tickets are process-local: realtime already requires one replica.
// The browser never receives the underlying HttpOnly HTTP session token.
const tickets = new Map();
export function issueRealtimeTicket(sessionToken) {
  for (const [key, item] of tickets) if (item.expiresAt <= Date.now()) tickets.delete(key);
  if (tickets.size >= 5000) throw new AppError(503, "Realtime authentication is busy", "AUTH_UNAVAILABLE");
  const ticket = `rt_${crypto.randomBytes(32).toString("hex")}`;
  tickets.set(ticket, { sessionToken, expiresAt: Date.now() + 30000 });
  return ticket;
}

export function consumeRealtimeTicket(ticket) {
  const item = tickets.get(ticket);
  tickets.delete(ticket);
  if (!item || item.expiresAt <= Date.now()) throw new AppError(401, "Realtime ticket expired", "UNAUTHORIZED");
  return item.sessionToken;
}
