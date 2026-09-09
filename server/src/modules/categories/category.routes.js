import { Router } from "express";

import { categoryController } from "./category.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  createSubcategorySchema,
  updateSubcategorySchema,
} from "./category.validation.js";

const router = Router();

/**
 * Category Routes
 *
 * Root categories are read-only (managed via SQL by admin).
 * Subcategories are fully managed through these endpoints.
 *
 * GET    /api/categories               — List all root categories with subcategories
 * POST   /api/categories/:id/subcategories — Create subcategory under root
 * PATCH  /api/subcategories/:id        — Update subcategory (name, description, is_active)
 * DELETE /api/subcategories/:id        — Delete subcategory (blocked if has products)
 */

// GET /api/categories — list all root categories with their subcategories
router.get("/", authenticate, authorize("admin"), categoryController.getCategories);

// POST /api/categories/:id/subcategories — create sub under root
router.post(
  "/:id/subcategories",
  authenticate,
  authorize("admin"),
  validate(createSubcategorySchema),
  categoryController.createSubcategory,
);

// PATCH /api/subcategories/:id — update sub
router.patch(
  "/subcategories/:id",
  authenticate,
  authorize("admin"),
  validate(updateSubcategorySchema),
  categoryController.updateSubcategory,
);

// DELETE /api/subcategories/:id — delete sub
router.delete(
  "/subcategories/:id",
  authenticate,
  authorize("admin"),
  categoryController.deleteSubcategory,
);

export default router;
