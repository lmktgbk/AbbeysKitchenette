import prisma from "../config/prisma.js";
import { AppError } from "../middleware/errorHandler.middleware.js";
import { recordEffects } from "../infrastructure/effects/domainEffects.js";

/** Resolve a pending suggestion once and save its audit atomically; model is supplied by trusted feature code. */
export function resolveAdvisory(model, id, status, userId, action) {
  return prisma.$transaction(async tx => {
    const claimed = await tx[model].updateMany({ where: { id, status: "pending" }, data: { status } });
    const row = await tx[model].findUnique({ where: { id }, include: { ingredient: { select: { ingredientName: true } } } });
    if (!row) throw new AppError(404, "Suggestion not found", "SUGGESTION_NOT_FOUND");
    if (!claimed.count) throw new AppError(409, "Suggestion already resolved. Refresh before trying again", "SUGGESTION_CONFLICT");
    await recordEffects(tx, { audit: { userId, action, targetType: "ingredient", targetId: row.ingredientId,
      details: { name: row.ingredient.ingredientName, suggestionId: id, unit: row.unit,
        ...(row.suggestedQuantity != null ? { suggested_quantity: Number(row.suggestedQuantity) } : {}) } } });
    const { ingredient: _ingredient, ...result } = row;
    return result;
  }, { timeout: 5000 });
}
