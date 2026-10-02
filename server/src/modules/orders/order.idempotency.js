import { createHash } from "node:crypto";
import prisma from "../../config/prisma.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { canonicalJson } from "../../../../shared/canonicalJson.js";

export function orderRequest(scope, key, payload) {
  if (typeof key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new AppError(400, "A UUID v4 Idempotency-Key is required for this submission", "IDEMPOTENCY_KEY_REQUIRED");
  }
  return { scope, key: key.toLowerCase(), requestHash: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}

function readResponse(row, request) {
  if (!row) return null;
  if (row.requestHash !== request.requestHash) {
    throw new AppError(409, "This submission key was already used with different details", "IDEMPOTENCY_CONFLICT");
  }
  if (row.response === null) throw new AppError(409, "Submission is not yet recoverable. Retry the same request", "SUBMISSION_PENDING");
  return row.response;
}

export const orderIdempotency = {
  async lookup(request, client = prisma) {
    const row = await client.orderRequest.findUnique({
      where: { scope_key: { scope: request.scope, key: request.key } },
      select: { requestHash: true, response: true },
    });
    return readResponse(row, request);
  },
  async claim(request, tx) {
    // The unique key waits for an overlapping transaction. A rollback releases
    // the claim; a commit exposes the result saved with the business writes.
    const result = await tx.orderRequest.createMany({ data: request, skipDuplicates: true });
    return result.count === 1 ? null : this.lookup(request, tx);
  },
  async complete(request, response, tx) {
    await tx.orderRequest.update({
      where: { scope_key: { scope: request.scope, key: request.key } },
      data: { response },
    });
    return response;
  },
};
