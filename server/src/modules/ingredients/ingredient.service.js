import { ingredientRepository } from "./ingredient.repository.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";
import { productService } from "../products/product.service.js";
import prisma from "../../config/prisma.js";

/**
 * Map Prisma Ingredient + stock quantity to snake_case API response format.
 * Centralizes the response shape used by create, update, restock, and declareLoss.
 * @param {object} ingredient - Prisma Ingredient record (camelCase)
 * @param {number} stockQuantity - computed stock from batches
 * @returns {object} - snake_case response object
 */
function mapToIngredientResponse(ingredient, stockQuantity) {
  return {
    ingredient_id: ingredient.ingredientId,
    ingredient_name: ingredient.ingredientName,
    unit: ingredient.unit,
    stock_quantity: stockQuantity,
    minimum_threshold: Number(ingredient.minimumThreshold),
    is_archived: ingredient.isArchived,
    version: ingredient.version,
    created_at: ingredient.createdAt,
    updated_at: ingredient.updatedAt,
  };
}

/**
 * Map Prisma RestockBatch to snake_case API response format.
 * Centralizes the response shape used by getBatches and toggleBatchPriority.
 * @param {object} batch - Prisma RestockBatch record (camelCase)
 * @returns {object} - snake_case response object
 */
function mapToBatchResponse(batch) {
  return {
    batch_id: batch.restockId,
    quantity_added: Number(batch.quantityAdded),
    quantity_left: Number(batch.quantityLeft),
    cost_per_unit: Number(batch.costPerUnit),
    total_cost: Number(batch.totalCost),
    supplier_name: batch.supplierName,
    notes: batch.notes,
    restocked_at: batch.restockedAt,
    is_priority: batch.isPriority,
  };
}

/**
 * Check stock level and create/resolve alerts accordingly.
 * Shared by restock and declareLoss transaction flows.
 * @param {string} ingredientId - ingredient UUID
 * @param {number} qtyAfter - stock level after operation
 * @param {number} threshold - minimum threshold
 * @param {object} tx - Prisma transaction client
 * @param {object} [options]
 * @param {boolean} [options.belowOnly=false] - if true, only alert when strictly below threshold
 *   (restock uses this: restocking to exactly threshold is "ok", declareLoss does not)
 */
async function checkStockAlerts(ingredientId, qtyAfter, threshold, tx, { belowOnly = false } = {}) {
  const isLow = belowOnly ? qtyAfter < threshold : qtyAfter <= threshold;

  if (isLow) {
    const existingAlert = await ingredientRepository.findOpenAlert(ingredientId, tx);
    if (!existingAlert) {
      await ingredientRepository.createStockAlert(
        {
          ingredientId,
          alertType: qtyAfter <= 0 ? "out_of_stock" : "low_stock",
          stockAtTrigger: qtyAfter,
        },
        tx,
      );
    }
  } else {
    await ingredientRepository.resolveStockAlerts(ingredientId, tx);
  }
}

/**
 * Ingredient Service
 *
 * Business logic for ingredient operations.
 * Validates rules, orchestrates repository calls, handles errors.
 */
export const ingredientService = {
  /* ── Queries ─────────────────────────── */

  /**
   * Get all non-archived ingredients with SQL-level pagination, search, status filter, and sort.
   * Status is computed via CASE WHEN at the database level — no in-memory filtering.
   *
   * @param {object} params - { page, limit, search, status, sortBy, sortDir }
   * @returns {{ ingredients: Array, totalItems: number }}
   */
  async getAll({ page = 1, limit = 50, search, status = "all", sortBy = "ingredient_name", sortDir = "asc" }) {
    const skip = (page - 1) * limit;

    // Step 1: Fetch paginated ingredients + count in parallel (same WHERE for both)
    const [ingredients, totalItems] = await Promise.all([
      ingredientRepository.findManyPaginated({ skip, take: limit, search, status, sortBy, sortDir }),
      ingredientRepository.countFiltered({ search, status }),
    ]);

    // Step 2: Batch-enrich with transaction counts and product links
    const ids = ingredients.map((i) => i.ingredient_id);
    const [txCountMap, linkedMap] = await Promise.all([
      ingredientRepository.countTransactionsBatch(ids),
      ingredientRepository.isLinkedToProductsBatch(ids),
    ]);

    // Step 3: Map to snake_case API format
    const enriched = ingredients.map((i) => ({
      ingredient_id: i.ingredient_id,
      ingredient_name: i.ingredient_name,
      unit: i.unit,
      stock_quantity: Number(i.stock_quantity),
      minimum_threshold: Number(i.minimum_threshold),
      is_archived: i.is_archived,
      has_transactions: txCountMap[i.ingredient_id] > 0,
      is_linked_to_products: linkedMap[i.ingredient_id] > 0,
      status: i.status,
      version: i.version,
      created_at: i.created_at,
      updated_at: i.updated_at,
    }));

    return { ingredients: enriched, totalItems };
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
      minimumThreshold: data.minimum_threshold ?? 0,
    });

    return mapToIngredientResponse(ingredient, 0);
  },

  /**
   * Update an ingredient — only name and minimum_threshold.
   * Unit is intentionally excluded to protect data integrity (changing unit would
   * break existing restock batches and stock records).
   * @param {string} id - ingredient UUID
   * @param {object} data - { ingredient_name?, minimum_threshold? }
   * @returns {object} - updated ingredient in snake_case
   * @throws {AppError} 404 if not found, 409 if duplicate name
   */
  async update(id, data) {
    // Step 1: Validate ingredient exists
    const existing = await ingredientRepository.findById(id);
    if (!existing || existing.isArchived) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const updateData = {};

    // Step 2: If name is changing, check for duplicates
    if (data.ingredient_name !== undefined) {
      const trimmedName = data.ingredient_name.trim();
      if (trimmedName !== existing.ingredientName) {
        const duplicate = await ingredientRepository.findByName(trimmedName);
        if (duplicate) {
          throw new AppError(
            409,
            "An ingredient with that name already exists",
            "INGREDIENT_EXISTS",
          );
        }
        updateData.ingredientName = trimmedName;
      }
    }

    // Step 3: Update minimum_threshold if provided
    if (data.minimum_threshold !== undefined) {
      updateData.minimumThreshold = data.minimum_threshold;
    }

    // Step 4: Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, "No valid fields to update", "NO_CHANGES");
    }

    const updated = await ingredientRepository.update(id, updateData);
    const stockQuantity = await ingredientRepository.getStockFromBatches(id);
    return mapToIngredientResponse(updated, stockQuantity);
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

    // Compute current stock from batches
    const qtyBefore = await ingredientRepository.getStockFromBatches(id);

    // Run all database writes in a single transaction — all succeed or all roll back
    await prisma.$transaction(async (tx) => {
      // Step 1: Create a new batch record (FIFO — first in, first out)
      // The batch tracks its own quantityLeft which decreases as stock is consumed
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

      // Step 2: Record the stock adjustment for audit trail (before → after)
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
      await checkStockAlerts(id, qtyAfter, threshold, tx, { belowOnly: true });
    });

    // Step 5: Ensure FIFO leader is starred (auto-star first/oldest batch)
    const priorityBatch = await ingredientRepository.findPriorityBatch(id);
    if (!priorityBatch) {
      const fifoLeaderId = await ingredientRepository.findFifoLeaderId(id);
      if (fifoLeaderId) {
        await ingredientRepository.setBatchPriority(fifoLeaderId, true);
      }
    }

    // Return the updated ingredient
    const stockQuantity = await ingredientRepository.getStockFromBatches(id);
    const response = mapToIngredientResponse(existing, stockQuantity);

    // Recompute variant availability for this ingredient
    await productService.recomputeVariantAvailability([id]);

    return response;
  },

  /* ── Loss Declaration ─────────────────── */

  /**
   * Declare a loss for an ingredient.
   * Deducts from a specific batch (if batch_id) or via FIFO (priority → oldest active batches).
   * Creates LossRecord + StockAdjustment in a single transaction.
   * @param {string} id - ingredient UUID
   * @param {object} data - { loss_type, quantity_lost, batch_id?, total_cost?, notes? }
   * @param {string} userId - admin who declared the loss
   * @returns {object} - updated ingredient in snake_case
   * @throws {AppError} 404 if not found, 400 if insufficient stock/invalid batch, 409 on conflict
   */
  async declareLoss(id, data, userId) {
    // Step 1: Validate ingredient exists and not archived
    const existing = await ingredientRepository.findById(id);
    if (!existing || existing.isArchived) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    const { loss_type, quantity_lost, batch_id, total_cost, notes } = data;
    const qty = Number(quantity_lost);

    // Step 2: Compute stock from batches
    const qtyBefore = await ingredientRepository.getStockFromBatches(id);

    // Step 3: Validate sufficient stock
    if (qtyBefore < qty) {
      throw new AppError(400, "Insufficient stock to declare this loss", "INSUFFICIENT_STOCK");
    }

    // Step 4: If specific batch selected, validate it belongs to this ingredient
    let batchVersion;
    let batchCostPerUnit;

    if (batch_id) {
      const batch = await ingredientRepository.findBatchByIdAndIngredient(batch_id, id);
      if (!batch) {
        throw new AppError(400, "Batch not found for this ingredient", "BATCH_NOT_FOUND");
      }
      if (Number(batch.quantityLeft) < qty) {
        throw new AppError(
          400,
          `Batch only has ${batch.quantityLeft} ${existing.unit} remaining`,
          "INSUFFICIENT_BATCH_STOCK",
        );
      }
      batchVersion = batch.version;
      batchCostPerUnit = Number(batch.costPerUnit ?? 0);
    }

    // Step 5: Run all writes in a single transaction
    await prisma.$transaction(async (tx) => {
      let totalCostLost;

      if (batch_id) {
        // Step 5a: Deduct from a specific batch
        totalCostLost = qty * batchCostPerUnit;
        await ingredientRepository.decrementBatchQuantity(batch_id, qty, batchVersion, tx);

        // Check if this batch was depleted — auto-rotate priority if needed
        const depletedBatch = await ingredientRepository.findBatchByIdAndIngredient(batch_id, id, tx);
        if (Number(depletedBatch.quantityLeft) <= 0) {
          await this.handleBatchDepletion(id, batch_id, tx);
        }
      } else {
        // Step 5b: FIFO — deduct across multiple active batches
        totalCostLost = await this._deductFifo(id, qty, tx);

        // Check if any priority batch was depleted during FIFO deduction
        const priorityBatch = await ingredientRepository.findPriorityBatch(id, tx);
        if (priorityBatch && Number(priorityBatch.quantityLeft) <= 0) {
          await this.handleBatchDepletion(id, priorityBatch.restockId, tx);
        }
      }

      // Step 5c: Compute cost per unit for the loss log
      const costVal = qty > 0 ? totalCostLost / qty : 0;
      const totalCostVal = total_cost !== undefined ? Number(total_cost) : totalCostLost;

      // Step 5d: Create LossRecord
      const lossLog = await ingredientRepository.createLossLog(
        {
          ingredientId: id,
          declaredById: userId,
          lossType: loss_type,
          quantityLost: qty,
          costPerUnit: costVal,
          totalCostLost: totalCostVal,
          relatedRestockId: batch_id || null,
          notes: notes || null,
        },
        tx,
      );

      // Step 5e: Record stock adjustment for audit trail
      await ingredientRepository.createAdjustment(
        {
          ingredientId: id,
          adjustedById: userId,
          adjustmentType: "loss",
          quantityBefore: qtyBefore,
          quantityChanged: -qty,
          quantityAfter: qtyBefore - qty,
          relatedLossId: lossLog.lossId,
          notes: notes || null,
        },
        tx,
      );

      // Step 5f: Check stock alerts — create if low/out, resolve if healthy
      const qtyAfter = qtyBefore - qty;
      const threshold = Number(existing.minimumThreshold);
      await checkStockAlerts(id, qtyAfter, threshold, tx);
    });

    // Step 6: Return updated ingredient
    const stockQuantity = await ingredientRepository.getStockFromBatches(id);
    const response = mapToIngredientResponse(existing, stockQuantity);

    // Recompute variant availability for this ingredient
    await productService.recomputeVariantAvailability([id]);

    return response;
  },

  /**
   * FIFO deduction helper — deducts stock across multiple batches in priority/FIFO order.
   * Iterates active batches, taking min(remaining, batchLeft) from each until quantity is consumed.
   * @param {string} ingredientId - ingredient UUID
   * @param {number} quantity - total quantity to deduct
   * @param {object} tx - Prisma transaction client
   * @returns {number} - total cost of all deductions
   * @throws {AppError} 400 if total stock across all batches is insufficient
   */
  async _deductFifo(ingredientId, quantity, tx) {
    const batches = await ingredientRepository.findActiveBatchesFifo(ingredientId, tx);

    let remaining = Number(quantity);
    let totalCost = 0;

    for (const batch of batches) {
      if (remaining <= 0) break;

      const batchLeft = Number(batch.quantityLeft);
      const take = Math.min(remaining, batchLeft);

      await ingredientRepository.decrementBatchQuantity(batch.restockId, take, batch.version, tx);

      totalCost += take * Number(batch.costPerUnit ?? 0);
      remaining -= take;
    }

    if (remaining > 0) {
      throw new AppError(400, "Insufficient stock to complete this operation", "INSUFFICIENT_STOCK");
    }

    return totalCost;
  },

  /**
   * Auto-rotate priority when a batch is depleted.
   * If the depleted batch had isPriority = true, clear it and set
   * the next FIFO leader (oldest active batch) as priority.
   * @param {string} ingredientId - ingredient UUID
   * @param {number} depletedBatchId - restockId of the depleted batch
   * @param {object} tx - Prisma transaction client
   */
  async handleBatchDepletion(ingredientId, depletedBatchId, tx) {
    // Check if the depleted batch was the priority batch
    const depletedBatch = await ingredientRepository.findBatchByIdAndIngredient(depletedBatchId, ingredientId, tx);
    if (!depletedBatch || !depletedBatch.isPriority) return;

    // Clear all priorities
    await ingredientRepository.clearAllPriority(ingredientId, tx);

    // Find and set the new FIFO leader
    const newLeaderId = await ingredientRepository.findFifoLeaderId(ingredientId, tx);
    if (newLeaderId) {
      await ingredientRepository.setBatchPriority(newLeaderId, true, tx);
    }
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
  async getBatches(id, { page = 1, limit = 50, search, sortBy = "restocked_at", sortDir = "asc" }) {
    // Step 1: Validate ingredient exists
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    // Step 2: Count total batches (for pagination)
    const totalItems = await ingredientRepository.countBatchesByIngredientId(id);

    // Step 3: Fetch paginated batches (skip/take/search/sort)
    const skip = (page - 1) * limit;
    const batches = await ingredientRepository.findBatchesByIngredientIdPaginated(id, {
      skip,
      take: limit,
      search,
      sortBy,
      sortDir,
    });

    // Step 4: Map to snake_case
    const mapped = batches.map(mapToBatchResponse);

    // Step 5: Check if any batch has priority (for "Follow FIFO" button)
    const priorityCount = await ingredientRepository.findPriorityCount(id);
    const hasPriority = priorityCount > 0;

    // Step 6: Always find FIFO leader (oldest active batch) — used to determine FIFO vs manual mode
    const fifoLeaderBatchId = await ingredientRepository.findFifoLeaderId(id);

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
  async getHistory(id, { page = 1, limit = 50, search, sortBy = "adjustedAt", sortDir = "desc", type }) {
    // Step 1: Validate ingredient exists
    const ingredient = await ingredientRepository.findById(id);
    if (!ingredient) {
      throw new AppError(404, "Ingredient not found", "INGREDIENT_NOT_FOUND");
    }

    // Step 2: Count total matching records (for pagination)
    const totalItems = await ingredientRepository.countHistoryByIngredientId(id, { type });

    // Step 3: Fetch paginated history (skip/take/search/type/sort)
    const skip = (page - 1) * limit;
    const adjustments = await ingredientRepository.findHistoryByIngredientIdPaginated(id, {
      skip,
      take: limit,
      search,
      type,
      sortBy,
      sortDir,
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

    // If setting priority, set it on the target batch
    // If un-starring, fall back to FIFO leader (oldest active batch)
    if (isPriority) {
      await ingredientRepository.setBatchPriority(batchId, true);
    } else {
      const fifoLeaderId = await ingredientRepository.findFifoLeaderId(ingredientId);
      if (fifoLeaderId) {
        await ingredientRepository.setBatchPriority(fifoLeaderId, true);
      }
    }

    // Fetch updated batch and return in snake_case
    const updated = await ingredientRepository.findBatchByIdAndIngredient(
      batchId,
      ingredientId,
    );

    return mapToBatchResponse(updated);
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

    // Clear all priority flags
    await ingredientRepository.clearAllPriority(ingredientId);

    // Set the FIFO leader (oldest active batch) as priority
    const fifoLeaderId = await ingredientRepository.findFifoLeaderId(ingredientId);
    if (fifoLeaderId) {
      await ingredientRepository.setBatchPriority(fifoLeaderId, true);
    }

    return { ingredient_id: ingredientId };
  },

  /* ── Archived ────────────────────────── */

  /**
   * Get all archived ingredients with transaction flags.
   * @returns {Array<object>}
   */
  async getArchived({ page = 1, limit = 50, search, sortBy = "ingredient_name", sortDir = "asc" }) {
    const skip = (page - 1) * limit;

    // Step 1: Fetch paginated archived ingredients + count in parallel
    const [ingredients, totalItems] = await Promise.all([
      ingredientRepository.findManyArchivedPaginated({ skip, take: limit, search, sortBy, sortDir }),
      ingredientRepository.countArchivedFiltered({ search }),
    ]);

    // Step 2: Batch-enrich with transaction counts and product links
    const ids = ingredients.map((i) => i.ingredient_id);
    const [txCountMap, linkedMap] = await Promise.all([
      ingredientRepository.countTransactionsBatch(ids),
      ingredientRepository.isLinkedToProductsBatch(ids),
    ]);

    // Step 3: Map to snake_case API format
    const enriched = ingredients.map((i) => ({
      ingredient_id: i.ingredient_id,
      ingredient_name: i.ingredient_name,
      unit: i.unit,
      stock_quantity: Number(i.stock_quantity),
      minimum_threshold: Number(i.minimum_threshold),
      is_archived: i.is_archived,
      has_transactions: txCountMap[i.ingredient_id] > 0,
      is_linked_to_products: linkedMap[i.ingredient_id] > 0,
      version: i.version,
      created_at: i.created_at,
      updated_at: i.updated_at,
    }));

    return { ingredients: enriched, totalItems };
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

    const linked = await ingredientRepository.isLinkedToProducts(id);
    if (linked) {
      throw new AppError(
        400,
        "Cannot delete ingredient that is linked to products",
        "LINKED_TO_PRODUCTS",
      );
    }

    await ingredientRepository.delete(id);
    return { ingredient_id: id };
  },
};
