import { ingredientRepository } from "./ingredient.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import prisma from "../../config/prisma.js";

/**
 * Ingredient Service
 *
 * Business logic for ingredient operations.
 * Validates rules, orchestrates repository calls, handles errors.
 */
export const ingredientService = {
  /* ── Queries ─────────────────────────── */

  /**
   * Get all non-archived ingredients with pagination, search, status filter, and sort.
   *
   * Since the ingredient list is small (50-200 items), we fetch ALL from the database
   * and do filtering/sorting/pagination in memory. This avoids complex Prisma queries
   * for computed fields like "status" (which depends on stock_quantity vs minimum_threshold).
   *
   * Pipeline: fetch → enrich → search → status filter → sort → paginate → return
   *
   * @param {object} params - { page, limit, search, status, sortBy, sortDir }
   * @returns {{ ingredients: Array, totalItems: number }}
   */
  async getAll({ page = 1, limit = 50, search, status = "all", sortBy = "ingredient_name", sortDir = "asc" }) {
    // Step 1: Fetch ALL non-archived ingredients from database
    const ingredients = await ingredientRepository.findAll();

    // Step 2: Batch-enrich each ingredient (fixes N+1 query problem)
    // Instead of 2 queries per ingredient, we do 2 batch queries for all ingredients at once
    const ids = ingredients.map((i) => i.ingredientId);
    const [txCountMap, linkedMap] = await Promise.all([
      ingredientRepository.countTransactionsBatch(ids),
      ingredientRepository.isLinkedToProductsBatch(ids),
    ]);

    // Step 3: Map raw DB fields to snake_case API format
    let enriched = ingredients.map((i) => ({
      ingredient_id: i.ingredientId,
      ingredient_name: i.ingredientName,
      unit: i.unit,
      stock_quantity: Number(i.stockQuantity),
      minimum_threshold: Number(i.minimumThreshold),
      is_archived: i.isArchived,
      has_transactions: txCountMap[i.ingredientId] > 0,
      is_linked_to_products: linkedMap[i.ingredientId] > 0,
      version: i.version,
      created_at: i.createdAt,
      updated_at: i.updatedAt,
    }));

    // Step 4: Search filter — match ingredient name (case-insensitive)
    if (search) {
      const q = search.toLowerCase();
      enriched = enriched.filter((i) => i.ingredient_name.toLowerCase().includes(q));
    }

    // Step 5: Status filter — computed from stock_quantity vs minimum_threshold
    // "out" = stock is 0, "low" = stock > 0 but <= threshold, "healthy" = stock > threshold
    if (status !== "all") {
      enriched = enriched.filter((i) => {
        if (status === "out") return i.stock_quantity === 0;
        if (status === "low") return i.stock_quantity > 0 && i.stock_quantity <= i.minimum_threshold;
        if (status === "healthy") return i.stock_quantity > i.minimum_threshold;
        return true;
      });
    }

    // Step 6: Sort — handle "status" as computed field, everything else as direct field
    const getStockStatus = (i) => {
      if (i.stock_quantity === 0) return 0;
      if (i.stock_quantity <= i.minimum_threshold) return 1;
      return 2;
    };

    enriched.sort((a, b) => {
      let cmp;
      if (sortBy === "status") {
        cmp = getStockStatus(a) - getStockStatus(b);
      } else {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        cmp = typeof aVal === "string"
          ? aVal.localeCompare(bVal)
          : (aVal ?? 0) - (bVal ?? 0);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    // Step 7: Paginate — slice to the requested page
    const totalItems = enriched.length;
    const start = (page - 1) * limit;
    const paginated = enriched.slice(start, start + limit);

    return { ingredients: paginated, totalItems };
  },

  /**
   * Get ingredient status counts for KPI cards.
   * Returns { total, healthy, low, out }.
   * @returns {object} - status summary
   */
  async getSummary() {
    return ingredientRepository.countByStatus();
  },

  /* ── Mutations ───────────────────────── */

  /**
   * Create a new ingredient.
   * Stock starts at 0 — admin must restock via POST /:id/restock to add inventory.
   * Rejects duplicate ingredient names (case-insensitive check).
   * @param {object} data - { ingredient_name, unit, minimum_threshold? }
   * @returns {object} - created ingredient in snake_case
   * @throws {AppError} 409 if ingredient name already exists
   */
  async create(data) {
    // Check for duplicate name
    const existing = await ingredientRepository.findByName(
      data.ingredient_name.trim(),
    );

    if (existing) {
      throw new AppError(
        409,
        "An ingredient with that name already exists",
        "INGREDIENT_EXISTS",
      );
    }

    const ingredient = await ingredientRepository.create({
      ingredientName: data.ingredient_name.trim(),
      unit: data.unit.trim(),
      stockQuantity: 0,
      minimumThreshold: data.minimum_threshold ?? 0,
    });

    return {
      ingredient_id: ingredient.ingredientId,
      ingredient_name: ingredient.ingredientName,
      unit: ingredient.unit,
      stock_quantity: Number(ingredient.stockQuantity),
      minimum_threshold: Number(ingredient.minimumThreshold),
      is_archived: ingredient.isArchived,
      version: ingredient.version,
      created_at: ingredient.createdAt,
      updated_at: ingredient.updatedAt,
    };
  },

  /* ── Restock ─────────────────────────── */

  /**
   * Restock an ingredient — creates a new FIFO batch and increments stock.
   *
   * Runs inside a transaction:
   *   1. Create RestockBatch record (FIFO batch with full quantity)
   *   2. Increment ingredient stock (with optimistic lock via version)
   *   3. Record StockAdjustment for audit trail (before → after)
   *   4. Check stock alerts — create if still low, resolve if now healthy
   *
   * @param {string} id - ingredient UUID
   * @param {object} data - { quantity_added, cost_per_unit, supplier_name?, notes? }
   * @param {string} userId - ID of the admin performing the restock
   * @returns {object} - updated ingredient in snake_case
   * @throws {AppError} 404 if ingredient not found or archived
   * @throws {AppError} 409 if concurrent modification detected
   */
  async restock(id, data, userId) {
    // Pre-check: ingredient must exist and not be archived
    const existing = await ingredientRepository.findById(id);
    if (!existing || existing.isArchived) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const { quantity_added, cost_per_unit, supplier_name, notes } = data;
    const qty = Number(quantity_added);
    const cost = Number(cost_per_unit);
    const total = qty * cost;
    const qtyBefore = Number(existing.stockQuantity);

    // Run all database writes in a single transaction — all succeed or all roll back
    await prisma.$transaction(async (tx) => {
      // Step 1: Create a new batch record (FIFO — first in, first out)
      // The batch tracks its own quantityLeft which decreases as stock is consumed by orders
      await ingredientRepository.createRestockBatch(
        {
          ingredientId: id,
          restockedById: userId,
          quantityAdded: qty,
          quantityLeft: qty,
          costPerUnit: cost,
          totalCost: total,
          supplierName: supplier_name || null,
          notes: notes || null,
        },
        tx,
      );

      // Step 2: Optimistic locking — read version, then increment stock only if version still matches
      // If another admin restocked between our read and write, the version won't match
      const { version } = await ingredientRepository.findIngredientVersion(id, tx);
      const success = await ingredientRepository.incrementStockChecked(
        id,
        qty,
        version,
        tx,
      );
      if (!success) {
        throw new AppError(
          409,
          "Concurrent modification detected. Please retry.",
          "CONCURRENT_CONFLICT",
        );
      }

      // Step 3: Record the stock adjustment for audit trail (before → after)
      await ingredientRepository.createAdjustment(
        {
          ingredientId: id,
          adjustedById: userId,
          adjustmentType: "restock",
          quantityBefore: qtyBefore,
          quantityChanged: qty,
          quantityAfter: qtyBefore + qty,
          notes: notes || null,
        },
        tx,
      );

      // Step 4: Check stock level after restock — create or resolve alerts
      const qtyAfter = qtyBefore + qty;
      const threshold = Number(existing.minimumThreshold);

      if (qtyAfter < threshold) {
        // Stock is still low — only create alert if none exists already
        const existingAlert = await ingredientRepository.findOpenAlert(id, tx);
        if (!existingAlert) {
          await ingredientRepository.createStockAlert(
            {
              ingredientId: id,
              alertType: qtyAfter <= 0 ? "out_of_stock" : "low_stock",
              stockAtTrigger: qtyAfter,
            },
            tx,
          );
        }
      } else {
        // Stock is healthy — resolve any open alerts
        await ingredientRepository.resolveStockAlerts(id, tx);
      }
    });

    // Return the updated ingredient
    const updated = await ingredientRepository.findById(id);
    return {
      ingredient_id: updated.ingredientId,
      ingredient_name: updated.ingredientName,
      unit: updated.unit,
      stock_quantity: Number(updated.stockQuantity),
      minimum_threshold: Number(updated.minimumThreshold),
      is_archived: updated.isArchived,
      version: updated.version,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
    };
  },

  /* ── Batches ─────────────────────────── */

  /**
   * Get all restock batches for an ingredient.
   * Returns snake_case fields for frontend consistency.
   * Sorted by priority first, then oldest first (FIFO).
   * @param {string} id - ingredient UUID
   * @param {object} options - { page, limit, search }
   * @returns {object} - { batches, totalItems, hasPriority, fifoLeaderBatchId }
   * @throws {AppError} 404 if ingredient not found
   */
  async getBatches(id, { page = 1, limit = 50, search }) {
    // Step 1: Validate ingredient exists
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    // Step 2: Count total batches (for pagination)
    const totalItems = await ingredientRepository.countBatchesByIngredientId(id);

    // Step 3: Fetch paginated batches (skip/take/search, fixed sort: priority → FIFO)
    const skip = (page - 1) * limit;
    const batches = await ingredientRepository.findBatchesByIngredientIdPaginated(id, {
      skip,
      take: limit,
      search,
    });

    // Step 4: Map to snake_case
    const mapped = batches.map((b) => ({
      batch_id: b.restockId,
      quantity_added: Number(b.quantityAdded),
      quantity_left: Number(b.quantityLeft),
      cost_per_unit: Number(b.costPerUnit),
      total_cost: Number(b.totalCost),
      supplier_name: b.supplierName,
      notes: b.notes,
      restocked_at: b.restockedAt,
      is_priority: b.isPriority,
    }));

    // Step 5: Check if any batch has priority (for "Follow FIFO" button)
    const priorityCount = await ingredientRepository.findPriorityCount(id);
    const hasPriority = priorityCount > 0;

    // Step 6: Find FIFO leader if no priority is set
    let fifoLeaderBatchId = null;
    if (!hasPriority) {
      fifoLeaderBatchId = await ingredientRepository.findFifoLeaderId(id);
    }

    // Step 7: Return batches + metadata
    return { batches: mapped, totalItems, hasPriority, fifoLeaderBatchId };
  },

  /**
   * Get stock adjustment history for an ingredient.
   * Returns paginated audit trail of all stock changes (restock, loss, manual, deduction).
   * Supports search (notes, adjuster name, date) and type filter at the database level.
   * @param {string} id - ingredient UUID
   * @param {object} options - { page, limit, search, type }
   * @returns {object} - { history, totalItems }
   * @throws {AppError} 404 if ingredient not found
   */
  async getHistory(id, { page = 1, limit = 50, search, type }) {
    // Step 1: Validate ingredient exists
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    // Step 2: Count total matching records (for pagination)
    const totalItems = await ingredientRepository.countHistoryByIngredientId(id, { type });

    // Step 3: Fetch paginated history (skip/take/search/type, fixed sort: newest first)
    const skip = (page - 1) * limit;
    const adjustments = await ingredientRepository.findHistoryByIngredientIdPaginated(id, {
      skip,
      take: limit,
      search,
      type,
    });

    // Step 4: Map to snake_case API format
    const mapped = adjustments.map((a) => ({
      adjustment_id: a.adjustmentId,
      adjustment_type: a.adjustmentType,
      quantity_changed: Number(a.quantityChanged),
      quantity_after: Number(a.quantityAfter),
      adjusted_by: a.adjustedBy.name,
      adjusted_at: a.adjustedAt.toISOString(),
      notes: a.notes,
    }));

    // Step 5: Return history + totalItems for pagination
    return { history: mapped, totalItems };
  },

  /**
   * Toggle priority (star) on a batch.
   * Enforces single-star rule: clears ALL priority flags first, then sets the target.
   * When isPriority=false, the batch is simply unstarred (FIFO resumes).
   * @param {string} ingredientId - ingredient UUID
   * @param {number} batchId - restock batch ID
   * @param {boolean} isPriority - true to star, false to unstar
   * @returns {object} - updated batch in snake_case
   * @throws {AppError} 404 if ingredient or batch not found
   */
  async toggleBatchPriority(ingredientId, batchId, isPriority) {
    // Verify ingredient exists
    const ingredient = await ingredientRepository.findById(ingredientId);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    // Verify batch belongs to this ingredient
    const batch = await ingredientRepository.findBatchByIdAndIngredient(
      batchId,
      ingredientId,
    );
    if (!batch) {
      throw new AppError(404, "Batch not found", "BATCH_NOT_FOUND");
    }

    // Clear all priority flags first (single-star rule)
    await ingredientRepository.clearAllPriority(ingredientId);

    // If setting priority (not just unstar), set it on the target batch
    if (isPriority) {
      await ingredientRepository.setBatchPriority(batchId, true);
    }

    // Fetch updated batch and return in snake_case
    const updated = await ingredientRepository.findBatchByIdAndIngredient(
      batchId,
      ingredientId,
    );

    return {
      batch_id: updated.restockId,
      quantity_added: Number(updated.quantityAdded),
      quantity_left: Number(updated.quantityLeft),
      cost_per_unit: Number(updated.costPerUnit),
      total_cost: Number(updated.totalCost),
      supplier_name: updated.supplierName,
      notes: updated.notes,
      restocked_at: updated.restockedAt,
      is_priority: updated.isPriority,
    };
  },

  /**
   * Follow FIFO — clear all priority flags for an ingredient.
   * Returns the system to natural FIFO order (oldest batch first).
   * @param {string} ingredientId - ingredient UUID
   * @returns {object} - confirmation with ingredient_id
   * @throws {AppError} 404 if ingredient not found
   */
  async followFifo(ingredientId) {
    const ingredient = await ingredientRepository.findById(ingredientId);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    // Clear all priority flags — natural FIFO resumes
    await ingredientRepository.clearAllPriority(ingredientId);

    return { ingredient_id: ingredientId };
  },

  /* ── Archived ────────────────────────── */

  /**
   * Get all archived ingredients with transaction flags.
   * @returns {Array<object>}
   */
  async getArchived({ page = 1, limit = 50, search, sortBy = "ingredient_name", sortDir = "asc" }) {
    // Step 1: Fetch ALL archived ingredients from database
    const ingredients = await ingredientRepository.findArchived();

    // Step 2: Batch-enrich each ingredient (fixes N+1 query problem)
    const ids = ingredients.map((i) => i.ingredientId);
    const [txCountMap, linkedMap] = await Promise.all([
      ingredientRepository.countTransactionsBatch(ids),
      ingredientRepository.isLinkedToProductsBatch(ids),
    ]);

    // Step 3: Map raw DB fields to snake_case API format
    let enriched = ingredients.map((i) => ({
      ingredient_id: i.ingredientId,
      ingredient_name: i.ingredientName,
      unit: i.unit,
      stock_quantity: Number(i.stockQuantity),
      minimum_threshold: Number(i.minimumThreshold),
      is_archived: i.isArchived,
      has_transactions: txCountMap[i.ingredientId] > 0,
      is_linked_to_products: linkedMap[i.ingredientId] > 0,
      version: i.version,
      created_at: i.createdAt,
      updated_at: i.updatedAt,
    }));

    // Step 4: Search filter — match ingredient name (case-insensitive)
    if (search) {
      const q = search.toLowerCase();
      enriched = enriched.filter((i) => i.ingredient_name.toLowerCase().includes(q));
    }

    // Step 5: Sort — direct field comparison
    enriched.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const cmp = typeof aVal === "string"
        ? aVal.localeCompare(bVal)
        : (aVal ?? 0) - (bVal ?? 0);
      return sortDir === "desc" ? -cmp : cmp;
    });

    // Step 6: Paginate — slice to the requested page
    const totalItems = enriched.length;
    const start = (page - 1) * limit;
    const paginated = enriched.slice(start, start + limit);

    return { ingredients: paginated, totalItems };
  },

  /* ── Archive & Delete ────────────────── */

  /**
   * Archive an ingredient.
   * Rejects if ingredient is linked to products.
   * @param {string} id - ingredient UUID
   * @returns {object}
   * @throws {AppError} 404 if not found
   * @throws {AppError} 400 if linked to products
   */
  async archive(id) {
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const linked = await ingredientRepository.isLinkedToProducts(id);
    if (linked) {
      throw new AppError(
        400,
        "Cannot archive ingredient that is linked to products",
        "LINKED_TO_PRODUCTS",
      );
    }

    const archived = await ingredientRepository.archive(id);
    return {
      ingredient_id: archived.ingredientId,
      ingredient_name: archived.ingredientName,
      is_archived: archived.isArchived,
    };
  },

  /**
   * Restore an archived ingredient.
   * @param {string} id - ingredient UUID
   * @returns {object}
   * @throws {AppError} 404 if not found
   */
  async restore(id) {
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const restored = await ingredientRepository.restore(id);
    return {
      ingredient_id: restored.ingredientId,
      ingredient_name: restored.ingredientName,
      is_archived: restored.isArchived,
    };
  },

  /**
   * Permanently delete an ingredient.
   * Rejects if ingredient has any transactions.
   * @param {string} id - ingredient UUID
   * @returns {object}
   * @throws {AppError} 404 if not found
   * @throws {AppError} 400 if has transactions
   */
  async delete(id) {
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const txCount = await ingredientRepository.countTransactions(id);
    if (txCount > 0) {
      throw new AppError(
        400,
        "Cannot delete ingredient with transaction history",
        "HAS_TRANSACTIONS",
      );
    }

    await ingredientRepository.delete(id);
    return { ingredient_id: id };
  },
};
