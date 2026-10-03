import { PrismaClient, Prisma } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "./env.js";

/** One pool per process. Runtime uses DATABASE_URL; DIRECT_URL is reserved for migrations.
 * Keep transactions short and size replica pools against the Supabase connection budget.
 */
// Bound connection acquisition; share this pool with the read-only health probe.
export const databasePool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_SIZE ?? 10,
  connectionTimeoutMillis: 2500,
  idleTimeoutMillis: 30000,
});
databasePool.on("error", () => console.error("[database] Idle connection failed"));
const adapter = new PrismaPg(databasePool, { disposeExternalPool: true });

const prisma = new PrismaClient({ adapter });

export { Prisma };
export default prisma;
