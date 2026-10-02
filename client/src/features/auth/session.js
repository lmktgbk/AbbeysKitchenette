import queryClient from "@/config/queryClient";
import useAuthStore from "./authStore";
import { stopRealtime, startRealtime } from "@/realtime/socket";

let sessionEpoch = 0;
export const getSessionEpoch = () => sessionEpoch;

export function restoreSession(user) {
  sessionEpoch += 1;
  queryClient.setQueryData(["auth", "me"], { success: true, data: { user } });
  useAuthStore.getState().setUser(user);
  // Reconnect with the newly issued HttpOnly cookie, not the old socket identity.
  stopRealtime();
  startRealtime();
}

export async function clearSession() {
  sessionEpoch += 1;
  stopRealtime();
  await queryClient.cancelQueries();
  queryClient.clear();
  queryClient.setQueryData(["auth", "me"], { success: true, data: { user: null } });
  useAuthStore.getState().logout();
}

export async function establishSession(user) {
  // Shared terminals must not expose the previous operator's cached API data.
  await clearSession();
  restoreSession(user);
}
