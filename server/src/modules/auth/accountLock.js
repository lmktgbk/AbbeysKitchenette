// Lock the account before its OTP/reset rows to keep credential transactions in one lock order.
export function lockAccount(tx, userId) {
  return tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

/** Return the locked account without a second network round trip. */
export async function lockSessionAccount(tx, userId) {
  const [user] = await tx.$queryRaw`SELECT id, name, email, role, image_url AS "imageUrl",
    "isActive", session_version AS "sessionVersion", "lockedUntil"
    FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  return user;
}
