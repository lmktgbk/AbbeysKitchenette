// Cookie transport is centralized here; route guards handle navigation after session expiry.
import axios from "axios";
import useAuthStore from "@/features/auth/authStore";
import { clearSession, getSessionEpoch } from "@/features/auth/session";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

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
      void clearSession();
    }
    return Promise.reject(error);
  },
);

export default api;
