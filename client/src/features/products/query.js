/**
 * Product Query Layer
 *
 * Centralized query + mutation hooks for the products feature.
 * Follows the ingredients pattern: components import hooks, not API functions.
 *
 * Structure:
 * - productKeys / categoryKeys: internal key factories (not exported)
 * - Query hooks: useProductList, useProductSummary, useProductDetail, useCategoryList
 * - Mutation hooks: useProductMutations, useCategoryMutations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factories (internal) ──────────────────── */

const productKeys = {
  all: ["products"],
  list: (params) => ["products", "list", params],
  summary: ["products", "summary"],
  detail: (id) => ["products", "detail", id],
};

const categoryKeys = {
  all: ["categories"],
};

const priceKeys = {
  all: ["priceOptimization"],
  suggestions: (productId) => ["priceOptimization", "suggestions", productId],
};

/* ── Query Hooks ───────────────────────────────── */

/**
 * useProductList — paginated active products.
 * @param {object} params - { page, limit, search, category, sortBy, sortDir }
 */
export function useProductList(params) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => api.getProductsRequest(params),
  });
}

/**
 * useProductSummary — KPI summary (total, available, unavailable, categories_used).
 */
export function useProductSummary() {
  return useQuery({
    queryKey: productKeys.summary,
    queryFn: api.getProductSummaryRequest,
  });
}

/**
 * useProductDetail — single product with variants and recipes.
 * @param {string} id - product UUID
 * @param {object} [options] - additional useQuery options
 */
export function useProductDetail(id, options = {}) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => api.getProductDetailRequest(id),
    ...options,
  });
}

/**
 * useCategoryList — all categories with nested subcategories.
 */
export function useCategoryList() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: api.getCategoriesRequest,
  });
}

/* ── Mutation Hook ─────────────────────────────── */

/**
 * useProductMutations — all CRUD mutations.
 * Each mutation's onSuccess invalidates all product queries.
 * Components pass their own onSuccess/onError via .mutate().
 *
 * @returns {object} - { create, update, updateVariants, deactivate, activate, remove, uploadImage }
 */
export function useProductMutations() {
  const queryClient = useQueryClient();

  /** Invalidate all product queries */
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: productKeys.all });
  }

  return {
    /** Create product — invalidates all product queries */
    create: useMutation({
      mutationFn: api.createProductRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Update product info — no auto-invalidation (component chains with updateVariants) */
    update: useMutation({
      mutationFn: ({ id, data }) => api.updateProductRequest(id, data),
    }),

    /** Replace all variants — invalidates detail */
    updateVariants: useMutation({
      mutationFn: ({ id, variants }) => api.updateVariantsRequest(id, variants),
      onSuccess: (_data, vars) => {
        queryClient.invalidateQueries({ queryKey: productKeys.detail(vars.id) });
        queryClient.invalidateQueries({ queryKey: productKeys.all });
      },
    }),

    /** Deactivate product + variants — invalidates all */
    deactivate: useMutation({
      mutationFn: api.deactivateProductRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Activate product — invalidates all */
    activate: useMutation({
      mutationFn: api.activateProductRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Delete product permanently — invalidates all */
    remove: useMutation({
      mutationFn: api.deleteProductRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Upload product image — no invalidation needed (returns URL) */
    uploadImage: useMutation({
      mutationFn: api.uploadImageRequest,
    }),
  };
}

/* ── Subcategory Mutation Hook ───────────────────── */

/**
 * useCategoryMutations — subcategory CRUD mutations.
 * Root categories are read-only (managed via SQL).
 *
 * @returns {object} - { createSub, updateSub, removeSub }
 */
export function useCategoryMutations() {
  const queryClient = useQueryClient();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    queryClient.invalidateQueries({ queryKey: productKeys.all });
  }

  return {
    createSub: useMutation({
      mutationFn: ({ categoryId, data }) => api.createSubcategoryRequest(categoryId, data),
      onSuccess: () => invalidateAll(),
    }),

    updateSub: useMutation({
      mutationFn: ({ id, data }) => api.updateSubcategoryRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),

    removeSub: useMutation({
      mutationFn: api.deleteSubcategoryRequest,
      onSuccess: () => invalidateAll(),
    }),
  };
}

/* ── Price Optimization Hooks ────────────────────── */

/**
 * usePriceSuggestions — pending price suggestions for a product.
 * @param {string} productId - product UUID
 */
export function usePriceSuggestions(productId) {
  return useQuery({
    queryKey: priceKeys.suggestions(productId),
    queryFn: () => api.getPriceSuggestionsRequest(productId),
    enabled: !!productId,
  });
}

/**
 * usePriceOptimizationMutations — generate, apply, dismiss.
 *
 * @returns {object} - { generate, apply, dismiss }
 */
export function usePriceOptimizationMutations() {
  const queryClient = useQueryClient();

  function invalidatePrice(productId) {
    queryClient.invalidateQueries({ queryKey: priceKeys.suggestions(productId) });
    queryClient.invalidateQueries({ queryKey: productKeys.all });
  }

  return {
    generate: useMutation({
      mutationFn: api.generatePriceSuggestionsRequest,
      onSuccess: (_data, productId) => {
        invalidatePrice(productId);
      },
    }),

    apply: useMutation({
      mutationFn: api.applyPriceRequest,
      onSuccess: (_data, vars) => {
        queryClient.invalidateQueries({ queryKey: priceKeys.all });
        queryClient.invalidateQueries({ queryKey: productKeys.all });
      },
    }),

    dismiss: useMutation({
      mutationFn: api.dismissPriceSuggestionRequest,
    }),
  };
}
