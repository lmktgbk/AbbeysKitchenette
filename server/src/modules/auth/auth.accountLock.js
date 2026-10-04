/** Lock the account before OTP/reset rows; the caller's transaction owns and releases the lock. */
export function lockAccount(tx, userId) {
  return tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

/** Return locked session fields in one query; absent accounts return undefined for caller rejection. */
export async function lockSessionAccount(tx, userId) {
  const [user] = await tx.$queryRaw`SELECT id, name, email, role, image_url AS "imageUrl",
    "isActive", session_version AS "sessionVersion", "lockedUntil"
    FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
  return user;
}
