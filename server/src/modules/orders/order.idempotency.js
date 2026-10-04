import { createHash } from "node:crypto";
import prisma from "../../config/prisma.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { canonicalJson } from "../../../../shared/canonicalJson.js";

/**
 * Build the identity used to prevent duplicate order submissions.
 * scope separates the operation and actor; key identifies one client submission.
 * The payload digest detects reuse of that key with changed order details.
 */
export function orderRequest(scope, key, payload) {
  // Accept UUID v4 keys only and normalize case so casing cannot create a second claim.
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new AppError(400, "A UUID v4 Idempotency-Key is required for this submission", "IDEMPOTENCY_KEY_REQUIRED");
  }
  // Canonical JSON ignores object-property order while preserving order-line array order.
  // This digest identifies request content; it is not an authentication signature.
  return { scope, key: key.toLowerCase(), requestHash: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}

/** Return a saved result only for matching content; null means no claim exists yet. */
function readResponse(row, request) {
  if (!row) return null;
  // Never replay another payload's result merely because its submission key matches.
  if (row.requestHash !== request.requestHash) {
    throw new AppError(409, "This submission key was already used with different details", "IDEMPOTENCY_CONFLICT");
  }
  // An existing claim without a result must not authorize another business write.
  if (row.response === null) throw new AppError(409, "Submission is not yet recoverable. Retry the same request", "SUBMISSION_PENDING");
  return row.response;
}

export const orderIdempotency = {
  /** Fast replay check; claim() must still arbitrate concurrent misses inside the write transaction. */
  async lookup(request, client = prisma) {
    const row = await client.orderRequest.findUnique({
      where: { scope_key: { scope: request.scope, key: request.key } },
      select: { requestHash: true, response: true },
    });
    return readResponse(row, request);
  },
  /**
   * Claim a submission within the caller's order transaction.
   * Return null for a new claim, or the saved response for an identical replay.
   * The caller must skip business writes when a replay is returned.
   */
  async claim(request, tx) {
    // The unique key waits for an overlapping transaction. A rollback releases
    // the claim; a commit exposes the result saved with the business writes.
    const result = await tx.orderRequest.createMany({ data: request, skipDuplicates: true });
    // A skipped insert belongs to an existing claim; validate its digest before replaying.
    return result.count === 1 ? null : this.lookup(request, tx);
  },
  /** Save the replay response in the same transaction as the order, payment, and stock writes. */
  async complete(request, response, tx) {
    await tx.orderRequest.update({
      where: { scope_key: { scope: request.scope, key: request.key } },
      data: { response },
    });
    return response;
  },
};
