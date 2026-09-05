import { productService } from "./product.service.js";
import { successResponse, errorResponse } from "../../utils/response.js";
import { AppError } from "../../middleware/errorHandler.middleware.js";

/**
 * Product Controller
 *
 * Handles HTTP requests for product operations.
 * Uses handleError to standardize error responses.
 */

/**
 * Wraps error response logic: AppError → show message, unexpected → generic.
 */
function handleError(res, error, fallbackCode) {
  if (error instanceof AppError) {
    return errorResponse(res, error.message, null, error.statusCode, error.code);
  }
  console.error(`[${fallbackCode}]`, error);
  return errorResponse(res, "Something went wrong", null, 500, fallbackCode);
}

export const productController = {
  /**
   * GET /api/products
   * Return paginated non-archived products.
   */
  async getProducts(req, res) {
    try {
      const { page, limit, search, category, status, sortBy, sortDir } = req.validatedQuery;
      const result = await productService.getAll({
        page: Number(page),
        limit: Number(limit),
        search,
        category,
        status,
        sortBy,
        sortDir,
      });
      return successResponse(res, "Products retrieved", result);
    } catch (error) {
      return handleError(res, error, "GET_PRODUCTS_ERROR");
    }
  },

  /**
   * GET /api/products/summary
   * Get product status counts for KPI cards.
   */
  async getSummary(req, res) {
    try {
      const summary = await productService.getSummary();
      return successResponse(res, "Summary retrieved", { summary });
    } catch (error) {
      return handleError(res, error, "GET_SUMMARY_ERROR");
    }
  },

  /**
   * GET /api/products/:id
   * Get a single product with variants and recipes.
   */
  async getProduct(req, res) {
    try {
      const product = await productService.getById(req.params.id);
      return successResponse(res, "Product retrieved", { product });
    } catch (error) {
      return handleError(res, error, "GET_PRODUCT_ERROR");
    }
  },

  /**
   * POST /api/products
   * Create a new product with variants and recipes.
   */
  async createProduct(req, res) {
    try {
      const product = await productService.create(req.body, req.user.id, req.ip);
      return successResponse(res, "Product created", { product }, 201);
    } catch (error) {
      return handleError(res, error, "CREATE_PRODUCT_ERROR");
    }
  },

  /**
   * PATCH /api/products/:id
   * Update product info (name, category, description, image, availability).
   */
  async updateProduct(req, res) {
    try {
      const product = await productService.update(req.params.id, req.body, req.user.id, req.ip);
      return successResponse(res, "Product updated", { product });
    } catch (error) {
      return handleError(res, error, "UPDATE_PRODUCT_ERROR");
    }
  },

  /**
   * PUT /api/products/:id/variants
   * Replace all variants for a product atomically.
   */
  async updateVariants(req, res) {
    try {
      const product = await productService.updateVariants(req.params.id, req.body.variants, req.user.id, req.ip);
      return successResponse(res, "Variants updated", { product });
    } catch (error) {
      return handleError(res, error, "UPDATE_VARIANTS_ERROR");
    }
  },

  /**
   * POST /api/products/:id/deactivate
   * Deactivate a product and all its variants.
   */
  async deactivateProduct(req, res) {
    try {
      const product = await productService.deactivate(req.params.id, req.user.id, req.ip);
      return successResponse(res, "Product deactivated", { product });
    } catch (error) {
      return handleError(res, error, "DEACTIVATE_PRODUCT_ERROR");
    }
  },

  /**
   * POST /api/products/:id/activate
   * Activate a product.
   */
  async activateProduct(req, res) {
    try {
      const product = await productService.activate(req.params.id, req.user.id, req.ip);
      return successResponse(res, "Product activated", { product });
    } catch (error) {
      return handleError(res, error, "ACTIVATE_PRODUCT_ERROR");
    }
  },

  /**
   * DELETE /api/products/:id
   * Permanently delete a product.
   */
  async deleteProduct(req, res) {
    try {
      const result = await productService.remove(req.params.id, req.user.id, req.ip);
      return successResponse(res, "Product deleted", result);
    } catch (error) {
      return handleError(res, error, "DELETE_PRODUCT_ERROR");
    }
  },
};
