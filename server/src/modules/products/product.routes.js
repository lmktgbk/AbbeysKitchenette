import { Router } from "express";

import { productController } from "./product.controller.js";
import { successResponse } from "../../utils/response.js";
import { validate, validateQuery, validateParams } from "../../middleware/validate.middleware.js";
import authenticate from "../../middleware/authenticate.middleware.js";
import authorize from "../../middleware/authorize.middleware.js";
import { uploadProductImage } from "../../middleware/upload.middleware.js";
import {
  createProductSchema,
  updateProductSchema,
  updateVariantsSchema,
  productIdParamSchema,
  variantIdParamSchema,
  getProductsQuerySchema,
} from "./product.validation.js";

const router = Router();

// Apply auth to all product routes
router.use(authenticate, authorize("admin"));

/**
 * Product Routes
 *
 * GET    /api/products/summary        — Status counts for KPI cards
 * POST   /api/products/upload-image   — Upload product image
 * GET    /api/products                — List all products
 * POST   /api/products                — Create product with variants + recipes
 * GET    /api/products/:id            — Get product detail
 * PATCH  /api/products/:id            — Update product info
 * PUT    /api/products/:id/variants   — Replace all variants
 * POST   /api/products/:id/variants/:variantId/activate   — Activate single variant
 * POST   /api/products/:id/variants/:variantId/deactivate — Deactivate single variant
 * POST   /api/products/:id/deactivate — Deactivate product + variants
 * POST   /api/products/:id/activate   — Activate product
 * DELETE /api/products/:id            — Hard delete
 */

// GET /api/products/summary — status counts (must be before /:id)
router.get("/summary", productController.getSummary);

// POST /api/products/upload-image — file upload (must be before /:id)
router.post(
  "/upload-image",
  uploadProductImage,
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }
    return successResponse(res, "Image uploaded", { url: req.file.path });
  },
);

// GET /api/products — list all non-archived
router.get("/", validateQuery(getProductsQuerySchema), productController.getProducts);

// POST /api/products — create product with variants + recipes
router.post("/", validate(createProductSchema), productController.createProduct);

// GET /api/products/:id — product detail
router.get("/:id", validateParams(productIdParamSchema), productController.getProduct);

// PATCH /api/products/:id — update product info
router.patch("/:id", validateParams(productIdParamSchema), validate(updateProductSchema), productController.updateProduct);

// POST /api/products/:id/variants/:variantId/activate — activate single variant
router.post("/:id/variants/:variantId/activate", validateParams(variantIdParamSchema), productController.activateVariant);

// POST /api/products/:id/variants/:variantId/deactivate — deactivate single variant
router.post("/:id/variants/:variantId/deactivate", validateParams(variantIdParamSchema), productController.deactivateVariant);

// PUT /api/products/:id/variants — replace all variants
router.put("/:id/variants", validateParams(productIdParamSchema), validate(updateVariantsSchema), productController.updateVariants);

// POST /api/products/:id/deactivate — deactivate product + variants
router.post("/:id/deactivate", validateParams(productIdParamSchema), productController.deactivateProduct);

// POST /api/products/:id/activate — activate product
router.post("/:id/activate", validateParams(productIdParamSchema), productController.activateProduct);

// DELETE /api/products/:id — hard delete
router.delete("/:id", validateParams(productIdParamSchema), productController.deleteProduct);

export default router;
