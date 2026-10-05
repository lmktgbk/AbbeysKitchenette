// Cookie transport is centralized here; route guards handle navigation after session expiry.
import axios from "axios";
import useAuthStore from "@/features/auth/authStore";
import { clearSession, getSessionEpoch } from "@/features/auth/session";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  // Browser writes must carry a non-simple header for backend origin checks.
  // This is a request marker, not an authentication secret.
  headers: {
    "Content-Type": "application/json",
    "X-SmartCafe-Request": "1",
  },
});

// Capture identity generation at dispatch. A delayed failure from a previous
// operator must not clear the next operator's successfully established session.
api.interceptors.request.use(config => {
  config.sessionEpoch = getSessionEpoch();
  return config;
});

// Expire only the session that made the request, never a newly signed-in operator.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 &&
        ["UNAUTHORIZED", "TOKEN_EXPIRED"].includes(error.response.data?.error) &&
        error.config?.sessionEpoch === getSessionEpoch() && useAuthStore.getState().user) {
      // Only the server's session-expiry codes trigger global cleanup. Other
      // 401 errors (for example a rejected recovery action) stay with their caller.
      void clearSession();
    }
    return Promise.reject(error);
  },
);

export default api;
