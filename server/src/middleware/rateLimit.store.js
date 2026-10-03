import { createHash } from "node:crypto";
import prisma from "../config/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "./errorHandler.middleware.js";

export class PostgresRateLimitStore {
  localKeys = false;
  constructor(prefix, database = prisma) { this.prefix = prefix; this.database = database; }
  init({ windowMs }) { this.windowMs = windowMs; }
  key(value) { return createHash("sha256").update(`${this.prefix}:${value}`).digest("hex"); }
  async increment(value) {
    try {
      // One atomic statement shares the budget across replicas without holding a transaction open.
      const [row] = await this.database.$queryRaw`INSERT INTO rate_limit_buckets (bucket_key, hits, reset_at)
      VALUES (${this.key(value)}, 1, clock_timestamp() + ${this.windowMs} * interval '1 millisecond')
      ON CONFLICT (bucket_key) DO UPDATE SET
        hits = CASE WHEN rate_limit_buckets.reset_at <= clock_timestamp() THEN 1 ELSE LEAST(rate_limit_buckets.hits + 1, 1000000) END,
        reset_at = CASE WHEN rate_limit_buckets.reset_at <= clock_timestamp()
          THEN clock_timestamp() + ${this.windowMs} * interval '1 millisecond' ELSE rate_limit_buckets.reset_at END
      RETURNING hits, reset_at`;
      return { totalHits: row.hits, resetTime: row.reset_at };
    } catch {
      throw new AppError(503, "Request protection is temporarily unavailable. Please retry shortly.", "RATE_LIMIT_STORAGE_UNAVAILABLE");
    }
  }
  async decrement(value) {
    await this.database.$executeRaw`UPDATE rate_limit_buckets SET hits = GREATEST(0, hits - 1)
      WHERE bucket_key = ${this.key(value)} AND reset_at > clock_timestamp()`;
  }
  async resetKey(value) {
    await this.database.$executeRaw`DELETE FROM rate_limit_buckets WHERE bucket_key = ${this.key(value)}`;
  }
}

export function sharedRateLimitStore(prefix) {
  return env.RATE_LIMIT_STORE === "postgres" ? new PostgresRateLimitStore(prefix) : undefined;
}

export async function pruneRateLimitBuckets(database = prisma) {
  // Bounded batches keep cleanup out of request latency and avoid a large delete transaction.
  return database.$executeRaw`DELETE FROM rate_limit_buckets WHERE bucket_key IN (
    SELECT bucket_key FROM rate_limit_buckets WHERE reset_at < clock_timestamp() - interval '1 day'
    ORDER BY reset_at LIMIT 1000 FOR UPDATE SKIP LOCKED
  )`;
}
