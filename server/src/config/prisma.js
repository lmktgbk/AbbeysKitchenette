import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

/**
 * Singleton Prisma client instance.
 *
 * Why singleton?
 * In development, hot-reloading creates a new PrismaClient on every file change.
 * Without singleton, you'd exhaust database connections quickly.
 * In production, this is less critical but still good practice.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const prisma = new PrismaClient({ adapter });

export default prisma;
