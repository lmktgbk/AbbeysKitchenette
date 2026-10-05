import "dotenv/config";
import { parseEnvironment } from "./env.schema.js";
// Parse once at startup; the schema rejects unsafe or missing configuration
// before routes and provider clients use it.
export const env = parseEnvironment(process.env);
