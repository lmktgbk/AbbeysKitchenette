import { z } from "zod";
import { pageQuery, limitQuery, searchQuery, calendarDate, LIMITS, integerId, coercedInteger, money, stockQuantity, unitCost } from "../../utils/validation.js";

/**
 * Ingredient Validation Schemas
 *
 * Used by validate middleware to validate request bodies.
 * If validation fails → error response, controller never executes.
 */

// Used by POST /api/ingredients — create ingredient
export const createIngredientSchema = z.object({
  ingredient_name: z
    .string()
    .trim()
    .min(1, "Ingredient name is required")
    .max(150, "Ingredient name must not exceed 150 characters"),
  unit: z
    .string()
    .trim()
    .min(1, "Unit is required")
    .max(50, "Unit must not exceed 50 characters"),
  minimum_threshold: stockQuantity()
    .optional(),
});

// Used by PATCH /api/ingredients/:id — edit ingredient (name and min threshold only)
export const updateIngredientSchema = z.object({
  ingredient_name: z
    .string()
    .trim()
    .min(1, "Ingredient name is required")
    .max(150, "Ingredient name must not exceed 150 characters")
    .optional(),
  minimum_threshold: stockQuantity()
    .optional(),
});

// Used by POST /api/ingredients/:id/restock — add stock via new FIFO batch
export const restockIngredientSchema = z.object({
  quantity_added: stockQuantity(true),
  cost_per_unit: unitCost(),
  supplier_name: z
    .string()
    .trim()
    .max(150, "Supplier name must not exceed 150 characters")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must not exceed 500 characters")
    .optional(),
  // BR-05: optional expiry date (YYYY-MM-DD). Omitted = no expiry tracking.
  expiry_date: calendarDate
    .optional(),
}).refine(data => Math.round(data.quantity_added * data.cost_per_unit * 100) / 100 <= LIMITS.money, { message: "Restock total exceeds the supported amount", path: ["cost_per_unit"] });

// Used by PATCH /api/ingredients/:id/batches/:batchId/expiry — set/correct a batch expiry date
export const updateBatchExpirySchema = z.object({
  expiry_date: calendarDate
    .nullable()
    .optional(),
});

// Used by PATCH /api/ingredients/:id/archive, /:id/restore, DELETE /api/ingredients/:id
export const idParamSchema = z.object({
  id: z.string().uuid("Invalid ingredient ID"),
});

// Used by PATCH /api/ingredients/:id/batches/:batchId/priority
export const batchIdParamSchema = z.object({
  id: z.string().uuid("Invalid ingredient ID"),
  batchId: coercedInteger(),
});

// Used by PATCH /api/ingredients/:id/batches/:batchId/priority — toggle batch priority
export const togglePrioritySchema = z.object({
  is_priority: z.boolean(),
});

// Used by POST /api/ingredients/:id/loss — declare a loss
// batch_id is optional: if provided, deduct from that specific batch; otherwise use FIFO
// total_cost is optional: if provided, overrides the auto-calculated cost from batch
export const declareLossSchema = z.object({
  loss_type: z.enum(["spoilage", "spillage", "expiry", "other"], {
    message: "Loss type is required",
  }),
  quantity_lost: stockQuantity(true),
  batch_id: integerId.optional(),
  total_cost: money().optional(),
  notes: z.string().trim().max(500, "Notes must not exceed 500 characters").optional(),
});

// Used by POST /api/ingredients/:id/count — record a physical stocktake count
export const recordCountSchema = z.object({
  physical_quantity: stockQuantity(),
  reason: z.enum(["spillage", "spoilage", "found_stock", "other"], {
    message: "Reason is required",
  }),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must not exceed 500 characters")
    .optional(),
});

// Used by GET /api/ingredients — query params for pagination, search, filter, sort
export const getIngredientsQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery("50"),
  search: searchQuery,
  status: z.enum(["all", "out", "low", "healthy"]).optional().default("all"),
  sortBy: z
    .enum(["ingredient_name", "unit", "stock_quantity", "minimum_threshold", "status"])
    .optional()
    .default("ingredient_name"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});

// Used by GET /api/ingredients/archived — query params for pagination, search, sort
// Same as active but without status filter (archived items have no stock status)
export const getArchivedQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery("50"),
  search: searchQuery,
  sortBy: z
    .enum(["ingredient_name", "unit", "stock_quantity", "minimum_threshold"])
    .optional()
    .default("ingredient_name"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});

// Used by GET /api/ingredients/:id/batches — query params for pagination, search
// Sort is fixed: priority first, then oldest first (FIFO). No user-configurable sort.
export const getBatchesQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery("50"),
  search: searchQuery,
  sortBy: z.enum(["restocked_at", "quantity_left", "cost_per_unit", "total_cost", "expiry_date"]).optional().default("restocked_at"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
});

// Used by GET /api/ingredients/:id/history — query params for pagination, search, type filter, sort
export const getHistoryQuerySchema = z.object({
  page: pageQuery,
  limit: limitQuery("50"),
  search: searchQuery,
  sortBy: z.enum(["adjustedAt", "type", "quantity_changed"]).optional().default("adjustedAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  type: z.enum(["all", "restock", "loss", "manual", "deduction"]).optional().default("all"),
});

export const ingredientOptionsQuerySchema = z.object({ limit: limitQuery("100"), cursor: z.string().uuid().optional() });
