import { z } from "zod";

const text = z.string().min(1).max(200);
const auditSchema = z.object({ userId: z.string().uuid().optional(), action: text,
  targetType: text.optional(), targetId: z.string().max(200).optional(), details: z.record(z.string(), z.unknown()).optional() });
const notificationSchema = z.object({ type: z.string().min(1).max(50), title: text,
  message: z.string().min(1).max(500), referenceType: z.string().max(50).optional(), referenceId: z.string().uuid().optional() });
export const effectSchema = z.object({ version: z.literal(1), audit: auditSchema.optional(),
  notifications: z.array(notificationSchema).max(100) });

function notificationMessage(message) {
  if (message.length <= 500) return message;
  // Avoid creating an unpaired UTF-16 surrogate when clipping an emoji;
  // PostgreSQL JSONB rejects those strings before the business commit.
  return `${message.slice(0, 499).replace(/[\uD800-\uDBFF]$/u, "")}…`;
}

/** Persist frozen follow-up work before the business transaction commits. */
export async function recordEffects(tx, { audit, notifications = [] }) {
  const payload = effectSchema.parse(JSON.parse(JSON.stringify({ version: 1, audit,
    notifications: notifications.map(n => ({ ...n, message: notificationMessage(n.message) })),
  })));
  if (!payload.audit && !payload.notifications.length) return;
  return tx.domainEffect.create({ data: { payload } });
}

export function recordMutation(db, write, effects) {
  return db.$transaction(async tx => {
    const row = await write(tx);
    await recordEffects(tx, effects(row));
    return row;
  }, { timeout: 5000 });
}
