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
