import { Router } from "express";

import { categoryController } from "./category.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import {
  createCategorySchema,
  updateCategorySchema,
} from "./category.validation.js";

const router = Router();

/**
 * Category Routes
 *
 * All routes require authentication and admin role.
 * GET    /api/categories       — List all categories
 * POST   /api/categories       — Create category
 * PATCH  /api/categories/:id   — Update category
 * DELETE /api/categories/:id   — Delete category (blocked if has products)
 */

// GET /api/categories — list all categories with product counts
router.get("/", authenticate, authorize("admin"), categoryController.getCategories);

// POST /api/categories — create category
router.post(
  "/",
  authenticate,
  authorize("admin"),
  validate(createCategorySchema),
  categoryController.createCategory,
);

// PATCH /api/categories/:id — update category
router.patch(
  "/:id",
  authenticate,
  authorize("admin"),
  validate(updateCategorySchema),
  categoryController.updateCategory,
);

// DELETE /api/categories/:id — delete category (blocked if has products)
router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  categoryController.deleteCategory,
);

export default router;
