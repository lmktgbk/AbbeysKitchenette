import api from "@/config/axios";

/**
 * Products API
 *
 * All API requests for product operations.
 * Returns res.data (the { success, message, data } envelope from backend).
 */

// ── List & Get ──────────────────────

// GET /api/products — paginated list with search, filter, sort
export async function getProductsRequest(params = {}) {
  const res = await api.get("/products", { params });
  return res.data;
}

// GET /api/products/summary — status counts for KPI cards
export async function getProductSummaryRequest() {
  const res = await api.get("/products/summary");
  return res.data;
}

// GET /api/products/:id — product detail with variants + recipes
export async function getProductDetailRequest(id) {
  const res = await api.get(`/products/${id}`);
  return res.data;
}

// ── Create & Update ─────────────────

// POST /api/products — create product with variants + recipes
export async function createProductRequest(data) {
  const res = await api.post("/products", data);
  return res.data;
}

// PATCH /api/products/:id — update product info
export async function updateProductRequest(id, data) {
  const res = await api.patch(`/products/${id}`, data);
  return res.data;
}

// PUT /api/products/:id/variants — replace all variants
export async function updateVariantsRequest(id, variants) {
  const res = await api.put(`/products/${id}/variants`, { variants });
  return res.data;
}

// ── Activate / Deactivate ───────────

// POST /api/products/:id/deactivate — deactivate product + all variants
export async function deactivateProductRequest(id) {
  const res = await api.post(`/products/${id}/deactivate`);
  return res.data;
}

// POST /api/products/:id/activate — activate product
export async function activateProductRequest(id) {
  const res = await api.post(`/products/${id}/activate`);
  return res.data;
}

// POST /api/products/:id/variants/:variantId/activate — activate single variant
export async function activateVariantRequest(productId, variantId) {
  const res = await api.post(`/products/${productId}/variants/${variantId}/activate`);
  return res.data;
}

// POST /api/products/:id/variants/:variantId/deactivate — deactivate single variant
export async function deactivateVariantRequest(productId, variantId) {
  const res = await api.post(`/products/${productId}/variants/${variantId}/deactivate`);
  return res.data;
}

// ── Delete ──────────────────────────

// DELETE /api/products/:id — hard delete
export async function deleteProductRequest(id) {
  const res = await api.delete(`/products/${id}`);
  return res.data;
}

// ── Image Upload ────────────────────

// POST /api/products/upload-image — upload product image
export async function uploadImageRequest(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await api.post("/products/upload-image", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

// ── Categories ─────────────────────

// GET /api/categories — all root categories with nested subcategories
export async function getCategoriesRequest() {
  const res = await api.get("/categories");
  return res.data;
}

// POST /api/categories/:id/subcategories — create subcategory
export async function createSubcategoryRequest(categoryId, data) {
  const res = await api.post(`/categories/${categoryId}/subcategories`, data);
  return res.data;
}

// PATCH /api/categories/subcategories/:id — update subcategory
export async function updateSubcategoryRequest(id, data) {
  const res = await api.patch(`/categories/subcategories/${id}`, data);
  return res.data;
}

// DELETE /api/categories/subcategories/:id — delete subcategory
export async function deleteSubcategoryRequest(id) {
  const res = await api.delete(`/categories/subcategories/${id}`);
  return res.data;
}

// ── Price Optimization ─────────────────

// GET /api/price-optimization?productId= — get pending suggestions
export async function getPriceSuggestionsRequest(productId) {
  const params = productId ? { productId } : {};
  const res = await api.get("/price-optimization", { params });
  return res.data;
}

// POST /api/price-optimization/generate — generate suggestions for a product
export async function generatePriceSuggestionsRequest(productId) {
  const res = await api.post("/price-optimization/generate", { productId });
  return res.data;
}

// POST /api/price-optimization/:id/apply — apply recommended price
export async function applyPriceRequest(id) {
  const res = await api.post(`/price-optimization/${id}/apply`);
  return res.data;
}

// POST /api/price-optimization/:id/dismiss — dismiss suggestion
export async function dismissPriceSuggestionRequest(id) {
  const res = await api.post(`/price-optimization/${id}/dismiss`);
  return res.data;
}
