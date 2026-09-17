import { inventoryCountRepository } from "./inventoryCount.repository.js";
import { ingredientRepository } from "../ingredients/ingredient.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import prisma from "../../config/prisma.js";

export const inventoryCountService = {
  async start(staffId, { notes }) {
    const active = await inventoryCountRepository.findActive();
    if (active) {
      throw new AppError(400, "An inventory count is already in progress. Complete it first.", "ACTIVE_COUNT_EXISTS");
    }
    return inventoryCountRepository.create({ staffId, notes });
  },

  async getActive() {
    return inventoryCountRepository.findActive();
  },

  async submit(countId, { items }) {
    const count = await inventoryCountRepository.findById(countId);
    if (!count) throw new AppError(404, "Inventory count not found", "COUNT_NOT_FOUND");
    if (count.status === "completed") throw new AppError(400, "This count is already completed", "COUNT_COMPLETED");

    // Get current system quantities from restock batches
    const enrichedItems = [];
    for (const item of items) {
      const systemQty = await ingredientRepository.getStockFromBatches(item.ingredient_id);
      enrichedItems.push({
        ingredientId: item.ingredient_id,
        systemQuantity: systemQty,
        actualQuantity: item.actual_quantity,
        notes: item.notes,
      });
    }

    await inventoryCountRepository.createItems(countId, enrichedItems);
    await inventoryCountRepository.complete(countId);

    return inventoryCountRepository.getSummary(countId);
  },

  async getById(countId) {
    const count = await inventoryCountRepository.findById(countId);
    if (!count) throw new AppError(404, "Inventory count not found", "COUNT_NOT_FOUND");
    return count;
  },

  async list(params) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    return inventoryCountRepository.findMany({
      page,
      limit,
      status: params.status,
      dateFrom: params.date_from,
      dateTo: params.date_to,
    });
  },

  async getSummary(countId) {
    return inventoryCountRepository.getSummary(countId);
  },
};
