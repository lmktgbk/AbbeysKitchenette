import prisma from "../../config/prisma.js";

/**
 * Ingredient Repository
 *
 * All database queries related to ingredients.
 * This layer only touches Prisma for ingredient operations.
 */
export const ingredientRepository = {
  /* ── Lookups ─────────────────────────── */

  /**
   * Find an ingredient by name.
   * Used to check for duplicate names before creating.
   * @param {string} name - ingredient name
   * @returns {object|null} - ingredient or null if not found
   */
  async findByName(name) {
    return prisma.ingredient.findFirst({
      where: { ingredientName: name },
    });
  },

  /**
   * Find all non-archived ingredients.
   * Ordered by name ascending.
   * @returns {Array<object>} - list of ingredients
   */
  async findAll() {
    return prisma.ingredient.findMany({
      where: { isArchived: false },
      orderBy: { ingredientName: "asc" },
    });
  },

  /**
   * Count ingredients by stock status.
   * Used by the summary endpoint for KPI cards.
   * @returns {{ total: number, healthy: number, low: number, out: number }}
   */
  async countByStatus() {
    const all = await prisma.ingredient.findMany({
      where: { isArchived: false },
      select: { stockQuantity: true, minimumThreshold: true },
    });

    let healthy = 0;
    let low = 0;
    let out = 0;

    for (const i of all) {
      const stock = Number(i.stockQuantity);
      const threshold = Number(i.minimumThreshold);
      if (stock === 0) out++;
      else if (stock <= threshold) low++;
      else healthy++;
    }

    return { total: all.length, healthy, low, out };
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new ingredient.
   * Stock starts at 0, avg cost starts at 0.
   * Admin must restock via POST /:id/restock to add inventory.
   * @param {object} data - { ingredientName, unit, minimumThreshold }
   * @returns {object} - created ingredient
   */
  async create(data) {
    return prisma.ingredient.create({
      data,
    });
  },

  /* ── Single Lookups ──────────────────── */

  /**
   * Find an ingredient by ID.
   * @param {string} id - ingredient UUID
   * @returns {object|null}
   */
  async findById(id) {
    return prisma.ingredient.findUnique({
      where: { ingredientId: id },
    });
  },

  /* ── Archived ────────────────────────── */

  /**
   * Find all archived ingredients.
   * @returns {Array<object>}
   */
  async findArchived() {
    return prisma.ingredient.findMany({
      where: { isArchived: true },
      orderBy: { ingredientName: "asc" },
    });
  },

  /* ── Relationship Checks ─────────────── */

  /**
   * Count total transactions for an ingredient.
   * Includes restock batches, loss records, and stock adjustments.
   * @param {string} id - ingredient UUID
   * @returns {number}
   */
  async countTransactions(id) {
    const [restockCount, lossCount, adjustmentCount] = await Promise.all([
      prisma.restockBatch.count({ where: { ingredientId: id } }),
      prisma.lossRecord.count({ where: { ingredientId: id } }),
      prisma.stockAdjustment.count({ where: { ingredientId: id } }),
    ]);
    return restockCount + lossCount + adjustmentCount;
  },

  /**
   * Check if an ingredient is linked to any product variants via Recipe.
   * @param {string} id - ingredient UUID
   * @returns {boolean}
   */
  async isLinkedToProducts(id) {
    const count = await prisma.recipe.count({
      where: { ingredientId: id },
    });
    return count > 0;
  },

  /**
   * Batch-count transactions for multiple ingredients at once.
   * Instead of N individual queries, this does 3 queries total.
   * @param {string[]} ids - array of ingredient UUIDs
   * @returns {Object<string, number>} - map of ingredientId → transaction count
   */
  async countTransactionsBatch(ids) {
    if (ids.length === 0) return {};

    const [restockCounts, lossCounts, adjustmentCounts] = await Promise.all([
      prisma.restockBatch.groupBy({
        by: ["ingredientId"],
        where: { ingredientId: { in: ids } },
        _count: true,
      }),
      prisma.lossRecord.groupBy({
        by: ["ingredientId"],
        where: { ingredientId: { in: ids } },
        _count: true,
      }),
      prisma.stockAdjustment.groupBy({
        by: ["ingredientId"],
        where: { ingredientId: { in: ids } },
        _count: true,
      }),
    ]);

    // Merge counts from all three tables into one map
    const countMap = {};
    for (const id of ids) countMap[id] = 0;
    for (const r of restockCounts) countMap[r.ingredientId] += r._count;
    for (const r of lossCounts) countMap[r.ingredientId] += r._count;
    for (const r of adjustmentCounts) countMap[r.ingredientId] += r._count;
    return countMap;
  },

  /**
   * Batch-check which ingredients are linked to products via Recipe.
   * Instead of N individual queries, this does 1 query.
   * @param {string[]} ids - array of ingredient UUIDs
   * @returns {Object<string, boolean>} - map of ingredientId → isLinked
   */
  async isLinkedToProductsBatch(ids) {
    if (ids.length === 0) return {};

    const linked = await prisma.recipe.groupBy({
      by: ["ingredientId"],
      where: { ingredientId: { in: ids } },
    });

    const linkedSet = new Set(linked.map((r) => r.ingredientId));
    const result = {};
    for (const id of ids) result[id] = linkedSet.has(id);
    return result;
  },

  /* ── Restock ─────────────────────────── */

  /**
   * Create a new restock batch (FIFO — first in, first out).
   * quantityLeft starts equal to quantityAdded — will decrease as stock is consumed.
   * @param {object} data - { ingredientId, restockedById, quantityAdded, quantityLeft, costPerUnit, totalCost, supplierName?, notes? }
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - created RestockBatch
   */
  async createRestockBatch(data, tx) {
    const client = tx || prisma;
    return client.restockBatch.create({ data });
  },

  /**
   * Read the current version number of an ingredient.
   * Used for optimistic locking — if another process修改s the ingredient
   * between this read and the subsequent increment, the version won't match.
   * @param {string} id - ingredient UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - { version: number }
   */
  async findIngredientVersion(id, tx) {
    const client = tx || prisma;
    return client.ingredient.findUnique({
      where: { ingredientId: id },
      select: { version: true },
    });
  },

  /**
   * Increment stock only if the version number still matches.
   * Returns false if another process modified the ingredient (concurrent conflict).
   * Uses updateMany with a WHERE clause — Prisma's way of doing conditional updates.
   * @param {string} id - ingredient UUID
   * @param {number} increment - amount to add to stockQuantity
   * @param {number} expectedVersion - version read before this operation
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {boolean} - true if update succeeded, false if version conflict
   */
  async incrementStockChecked(id, increment, expectedVersion, tx) {
    const client = tx || prisma;
    const result = await client.ingredient.updateMany({
      where: { ingredientId: id, version: expectedVersion },
      data: {
        stockQuantity: { increment },
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  },

  /**
   * Record a stock adjustment for the audit trail.
   * Tracks before/after quantities and links to the related restock batch.
   * @param {object} data - { ingredientId, adjustedById, adjustmentType, quantityBefore, quantityChanged, quantityAfter, relatedRestockId?, notes? }
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - created StockAdjustment
   */
  async createAdjustment(data, tx) {
    const client = tx || prisma;
    return client.stockAdjustment.create({ data });
  },

  /**
   * Fetch stock adjustment history for an ingredient.
   * Joins User table to get the adjuster's name.
   * Ordered by most recent first.
   * @param {string} id - ingredient UUID
   * @param {number} [limit=50] - max records to return
   * @returns {Promise<Array>} - adjustments with adjustedBy.name
   */
  async findAdjustmentsByIngredientId(id, limit = 50) {
    return prisma.stockAdjustment.findMany({
      where: { ingredientId: id },
      include: {
        adjustedBy: { select: { name: true } },
      },
      orderBy: { adjustedAt: "desc" },
      take: limit,
    });
  },

  /* ── History (Server-Side Pagination) ── */

  /**
   * Count history records for an ingredient, with optional type filter.
   * Used for pagination totalItems.
   * @param {string} id - ingredient UUID
   * @param {object} [options] - { type }
   * @returns {number} - total record count
   */
  async countHistoryByIngredientId(id, { type } = {}) {
    const where = { ingredientId: id };
    if (type && type !== "all") where.adjustmentType = type;
    return prisma.stockAdjustment.count({ where });
  },

  /**
   * Fetch paginated history records with search and type filter.
   * Search matches notes (text) and adjustedBy name (relation filter).
   * Also supports date search — parses the search term as a Date and filters
   * adjustedAt to that day's start/end.
   * Sort is fixed: newest first (adjustedAt desc).
   * @param {string} id - ingredient UUID
   * @param {object} options - { skip, take, search, type }
   * @returns {Array<object>} - paginated StockAdjustment records with adjustedBy.name
   */
  async findHistoryByIngredientIdPaginated(id, { skip, take, search, type }) {
    const where = { ingredientId: id };

    // Step 1: Type filter — restrict to a specific adjustment type
    if (type && type !== "all") {
      where.adjustmentType = type;
    }

    // Step 2: Search filter — match notes, adjuster name, or date
    if (search) {
      const orFilters = [
        { notes: { contains: search, mode: "insensitive" } },
        { adjustedBy: { name: { contains: search, mode: "insensitive" } } },
      ];

      // Try parsing search as a date (e.g. "Aug 21", "2026-08-21")
      const parsedDate = new Date(search);
      if (!isNaN(parsedDate.getTime())) {
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);
        orFilters.push({ adjustedAt: { gte: startOfDay, lte: endOfDay } });
      }

      where.OR = orFilters;
    }

    return prisma.stockAdjustment.findMany({
      where,
      include: {
        adjustedBy: { select: { name: true } },
      },
      orderBy: { adjustedAt: "desc" },
      skip,
      take,
    });
  },

  /**
   * Check if an unresolved stock alert already exists for this ingredient.
   * Prevents duplicate alerts when stock is restocked but still below threshold.
   * @param {string} ingredientId - ingredient UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object|null} - existing StockAlert or null
   */
  async findOpenAlert(ingredientId, tx) {
    const client = tx || prisma;
    return client.stockAlert.findFirst({
      where: { ingredientId, isResolved: false },
    });
  },

  /**
   * Create a stock alert when ingredient falls below minimum threshold.
   * Alert type is "out_of_stock" if qty <= 0, otherwise "low_stock".
   * @param {object} data - { ingredientId, alertType, stockAtTrigger }
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - created StockAlert
   */
  async createStockAlert(data, tx) {
    const client = tx || prisma;
    return client.stockAlert.create({ data });
  },

  /**
   * Resolve all open stock alerts for an ingredient.
   * Called when stock is restored above the minimum threshold.
   * @param {string} ingredientId - ingredient UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - Prisma batch update result
   */
  async resolveStockAlerts(ingredientId, tx) {
    const client = tx || prisma;
    return client.stockAlert.updateMany({
      where: { ingredientId, isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  },

  /* ── Batches ─────────────────────────── */

  /**
   * Find all restock batches for an ingredient, ordered by priority first then FIFO.
   * Priority batches come first (admin-selected), then oldest first (FIFO).
   * Used by GET /:id/batches and the expanded row to determine the current active batch.
   * @param {string} id - ingredient UUID
   * @returns {Array<object>} - list of RestockBatch records
   */
  async findBatchesByIngredientId(id) {
    return prisma.restockBatch.findMany({
      where: { ingredientId: id },
      orderBy: [{ isPriority: "desc" }, { restockedAt: "asc" }],
    });
  },

  /**
   * Find a specific batch by its ID and ingredient ID.
   * Used to verify a batch belongs to the correct ingredient before operations.
   * @param {number} batchId - restock batch ID
   * @param {string} ingredientId - ingredient UUID
   * @returns {object|null} - RestockBatch or null
   */
  async findBatchByIdAndIngredient(batchId, ingredientId) {
    return prisma.restockBatch.findFirst({
      where: { restockId: batchId, ingredientId },
    });
  },

  /**
   * Clear all priority flags for an ingredient.
   * Ensures only ONE batch can be priority at a time (single-star rule).
   * @param {string} ingredientId - ingredient UUID
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - Prisma batch update result
   */
  async clearAllPriority(ingredientId, tx) {
    const client = tx || prisma;
    return client.restockBatch.updateMany({
      where: { ingredientId, isPriority: true },
      data: { isPriority: false },
    });
  },

  /**
   * Set priority flag on a specific batch.
   * Called after clearAllPriority to enforce single-star rule.
   * @param {number} batchId - restock batch ID
   * @param {boolean} isPriority - whether to set or unset priority
   * @param {object} [tx] - optional Prisma transaction client
   * @returns {object} - updated RestockBatch
   */
  async setBatchPriority(batchId, isPriority, tx) {
    const client = tx || prisma;
    return client.restockBatch.update({
      where: { restockId: batchId },
      data: { isPriority },
    });
  },

  /* ── Batches (Server-Side Pagination) ── */

  /**
   * Count total batches for an ingredient.
   * Used for pagination totalItems.
   * @param {string} id - ingredient UUID
   * @returns {number} - total batch count
   */
  async countBatchesByIngredientId(id) {
    return prisma.restockBatch.count({
      where: { ingredientId: id },
    });
  },

  /**
   * Fetch paginated batches for an ingredient with search filter.
   * Sort is fixed: priority first, then oldest first (FIFO).
   * Search matches supplier name, notes, or batch ID (b-{restockId}).
   * @param {string} id - ingredient UUID
   * @param {object} options - { skip, take, search }
   * @returns {Array<object>} - paginated RestockBatch records
   */
  async findBatchesByIngredientIdPaginated(id, { skip, take, search }) {
    const where = { ingredientId: id };

    if (search) {
      const parsed = search.replace(/^b-?/i, "");
      const batchId = Number(parsed);
      const orFilters = [
        { supplierName: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
      if (!isNaN(batchId) && batchId > 0) {
        orFilters.push({ restockId: batchId });
      }
      where.OR = orFilters;
    }

    return prisma.restockBatch.findMany({
      where,
      orderBy: [{ isPriority: "desc" }, { restockedAt: "asc" }],
      skip,
      take,
    });
  },

  /**
   * Count how many batches have priority flag set for an ingredient.
   * Used to determine if "Follow FIFO" button should be enabled.
   * @param {string} ingredientId - ingredient UUID
   * @returns {number} - count of priority batches
   */
  async findPriorityCount(ingredientId) {
    return prisma.restockBatch.count({
      where: { ingredientId, isPriority: true },
    });
  },

  /**
   * Find the FIFO leader — the oldest active batch with remaining stock.
   * When no priority is set, this batch gets the highlighted star.
   * @param {string} ingredientId - ingredient UUID
   * @returns {number|null} - restockId of FIFO leader, or null if no active batches
   */
  async findFifoLeaderId(ingredientId) {
    const batch = await prisma.restockBatch.findFirst({
      where: { ingredientId, quantityLeft: { gt: 0 } },
      orderBy: { restockedAt: "asc" },
      select: { restockId: true },
    });
    return batch ? batch.restockId : null;
  },

  /* ── Archive & Delete ────────────────── */

  /**
   * Archive an ingredient (soft delete).
   * @param {string} id - ingredient UUID
   * @returns {object}
   */
  async archive(id) {
    return prisma.ingredient.update({
      where: { ingredientId: id },
      data: { isArchived: true },
    });
  },

  /**
   * Restore an archived ingredient.
   * @param {string} id - ingredient UUID
   * @returns {object}
   */
  async restore(id) {
    return prisma.ingredient.update({
      where: { ingredientId: id },
      data: { isArchived: false },
    });
  },

  /**
   * Hard delete an ingredient.
   * @param {string} id - ingredient UUID
   * @returns {object}
   */
  async delete(id) {
    return prisma.ingredient.delete({
      where: { ingredientId: id },
    });
  },
};
