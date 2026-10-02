import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // The server suite also verifies the client session contract without a browser.
    alias: { "@": fileURLToPath(new URL("../client/src", import.meta.url)) },
  },
});
