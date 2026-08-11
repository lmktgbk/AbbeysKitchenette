import { PrismaClient } from "../generated/prisma/client";

/**
 * Singleton Prisma client instance.
 *
 * Why singleton?
 * In development, hot-reloading creates a new PrismaClient on every file change.
 * Without singleton, you'd exhaust database connections quickly.
 * In production, this is less critical but still good practice.
 *
 * Usage in any repository:
 *   import prisma from '../config/prisma.js';
 *   const users = await prisma.user.findMany();
 */
const prisma = new PrismaClient();

export default prisma;
