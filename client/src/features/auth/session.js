import queryClient from "@/config/queryClient";
import useAuthStore from "./authStore";
import { stopRealtime, startRealtime } from "@/realtime/socket";

// This process-local generation distinguishes requests from successive browser
// sessions. It is not a token or proof of server-side authorization.
let sessionEpoch = 0;
export const getSessionEpoch = () => sessionEpoch;

/** Publish a server-confirmed user after credential rotation; retain feature caches for the same operator. */
export function restoreSession(user) {
  sessionEpoch += 1;
  queryClient.setQueryData(["auth", "me"], { success: true, data: { user } });
  useAuthStore.getState().setUser(user);
  // Reconnect with the newly issued HttpOnly cookie, not the old socket identity.
  stopRealtime();
  startRealtime();
}

/** Stop local realtime work, cancel query tracking, and discard cached data before publishing signed-out state. */
export async function clearSession() {
  sessionEpoch += 1;
  stopRealtime();
  await queryClient.cancelQueries();
  // Clearing includes inactive queries and mutation cache entries. Seed an
  // explicit signed-out auth result so the provider does not reuse an old user.
  queryClient.clear();
  queryClient.setQueryData(["auth", "me"], { success: true, data: { user: null } });
  useAuthStore.getState().logout();
}

/** Start a newly authenticated operator with cleared caches, then reconnect using the issued cookie. */
export async function establishSession(user) {
  // Shared terminals must not expose the previous operator's cached API data.
  await clearSession();
  restoreSession(user);
}
