import prisma from "../config/prisma.js";
import { effectSchema } from "./domainEffects.js";

export function createEffectsRepository(db = prisma) {
  return {
    async deliverOne() {
      let claimed;
      try {
        return await db.$transaction(async tx => {
          const [row] = await tx.$queryRaw`SELECT * FROM domain_effects WHERE state = 'pending' AND next_attempt_at <= clock_timestamp()
            ORDER BY next_attempt_at, created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`;
          if (!row) return null;
          claimed = row;
          const payload = effectSchema.parse(row.payload);
          if (payload.audit) {
            const { userId, ...audit } = payload.audit;
            const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { id: true } }) : null;
            await tx.auditLog.create({ data: { ...audit, userId: actor?.id ?? null, createdAt: row.created_at,
              details: { ...audit.details, ...(userId && !actor ? { actor_id: userId } : {}) } } });
          }
          if (payload.notifications.length) await tx.notification.createMany({ data: payload.notifications.map(n => ({ ...n, createdAt: row.created_at })) });
          await tx.domainEffect.update({ where: { id: row.id }, data: { state: "delivered", deliveredAt: new Date() } });
          return { audit: Boolean(payload.audit), notifications: payload.notifications.length };
        }, { timeout: 5000 });
      } catch {
        if (!claimed) throw Error("Domain effect storage unavailable");
        // Delivery and its completion marker roll back together. Fence retry metadata
        // so another worker's successful delivery cannot be overwritten by this failure.
        const attempts = claimed.attempts + 1;
        const updated = await db.domainEffect.updateMany({ where: { id: claimed.id, state: "pending", attempts: claimed.attempts },
          data: { attempts, state: attempts >= 6 ? "blocked" : "pending",
            nextAttemptAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** (attempts - 1))) } });
        if (attempts >= 6 && updated.count) console.warn("[effects] Follow-up requires review:", claimed.id);
        return { deferred: true };
      }
    },
    async repairAvailability() {
      const jobs = await db.availabilityRepair.findMany({ take: 50, orderBy: { queuedAt: "asc" } });
      if (!jobs.length) return 0;
      const ids = jobs.map(j => j.variantId).sort((a, b) => a - b);
      await db.$transaction(async tx => {
        // Lock variants before repair rows, matching recipe edits. Revision tokens
        // prevent a concurrent stock change from being erased by an older repair.
        await tx.$queryRawUnsafe("SELECT variant_id FROM product_variants WHERE variant_id = ANY($1::int[]) ORDER BY variant_id FOR UPDATE", ids);
        await tx.$executeRawUnsafe(`WITH needed AS (
          SELECT DISTINCT ingredient_id FROM recipes WHERE variant_id = ANY($1::int[])
        ), stocks AS (
          SELECT b.ingredient_id, SUM(b.quantity_left) AS quantity FROM restock_batches b
          JOIN needed n ON n.ingredient_id = b.ingredient_id WHERE b.quantity_left > 0 GROUP BY b.ingredient_id
        ), availability AS (
          SELECT r.variant_id, bool_and(NOT i.is_archived AND COALESCE(s.quantity, 0) >= r.quantity_needed) AS available
          FROM recipes r JOIN ingredients i ON i.ingredient_id = r.ingredient_id
          LEFT JOIN stocks s ON s.ingredient_id = r.ingredient_id
          WHERE r.variant_id = ANY($1::int[]) GROUP BY r.variant_id
        ) UPDATE product_variants v SET is_available = a.available FROM availability a
          WHERE v.variant_id = a.variant_id AND NOT v.is_manually_deactivated`, ids);
        await tx.availabilityRepair.deleteMany({ where: { OR: jobs.map(j => ({ variantId: j.variantId, revision: j.revision })) } });
      }, { timeout: 5000 });
      return jobs.length;
    },
    async prune() {
      await db.$executeRaw`DELETE FROM domain_effects WHERE id IN (SELECT id FROM domain_effects
        WHERE state = 'delivered' AND delivered_at < clock_timestamp() - INTERVAL '7 days' LIMIT 1000)`;
    },
  };
}
export const effectsRepository = createEffectsRepository();
