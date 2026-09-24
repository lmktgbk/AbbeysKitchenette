import { PrismaClient, Prisma } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

/**
 * Singleton Prisma client instance.
 *
 * Why singleton?
 * In development, hot-reloading creates a new PrismaClient on every file change.
 * Without singleton, you'd exhaust database connections quickly.
 * In production, this is less critical but still good practice.
 *
 * Transport split: runtime uses DATABASE_URL (Supabase transaction pooler),
 * while DIRECT_URL exists for the Prisma CLI only. Interactive $transactions
 * stay short and parallel-safe by design — if they ever grow long, move this
 * to a session-mode connection rather than raising timeouts blindly.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const prisma = new PrismaClient({ adapter });

export { Prisma };
export default prisma;
