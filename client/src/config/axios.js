/**
 * Axios — owns shared HTTP transport (baseURL from VITE_API_URL + cookie auth).
 * WHY: centralizes VITE_API_URL baseURL and withCredentials cookie auth so features never configure axios directly; response interceptor passes through errors (redirects live in Router guards, not here).
 * State: axios instance only, no app state; values unchanged.
 */
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: "true",
  headers: {
    "Content-Type": "application/json",
  },
});

// Response interceptor — handle errors (no redirect here)
// Redirects are handled by ProtectedRoute and PublicRoute in Router.jsx
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  },
);

export default api;
