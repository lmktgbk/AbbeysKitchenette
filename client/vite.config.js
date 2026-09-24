import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

/**
 * vite.config — Vite + React + Tailwind build config.
 * WHY: "@" alias keeps deep feature imports short; dev-only /api proxy targets
 * localhost:5000 so the browser avoids CORS. Prod uses VITE_API_URL (see .env.example).
 * See https://vite.dev/config/
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
