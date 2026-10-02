// Lock the account before its OTP/reset rows to keep credential transactions in one lock order.
export function lockAccount(tx, userId) {
  return tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}
