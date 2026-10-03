import { env } from "../src/config/env.js";

// Validate configuration without connecting to providers or printing credentials.
if (env.NODE_ENV !== "production") throw new Error("Set NODE_ENV=production for the deployment check");
console.log("Production environment validation passed. Live ingress, browser cookies and provider delivery still require acceptance testing.");
