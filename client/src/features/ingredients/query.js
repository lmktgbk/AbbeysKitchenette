/**
 * Ingredient Query Layer
 *
 * Centralized query + mutation hooks for the ingredients feature.
 * Follows SmartCafe's pattern: components import hooks, not API functions or query keys.
 *
 * Structure:
 * - ingredientKeys: internal key factory (not exported)
 * - Query hooks: useIngredientList, useIngredientArchived, etc.
 * - Mutation hook: useIngredientMutations — returns all CRUD + batch mutations
 *
 * Design:
 * - Hook onSuccess handles cache invalidation only
 * - Components pass their own onSuccess/onError via .mutate() for toast + UI state
 * - Both callbacks run: hook's first (invalidation), then mutate's (toast + modal close)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factory (internal) ────────────────────── */

const ingredientKeys = {
  all: ["ingredients"],
  list: (params) => ["ingredients", "list", params],
  archived: (params) => ["ingredients", "archived", params],
  summary: ["ingredients", "summary"],
  alerts: ["ingredients", "alerts"],
  batches: (id) => ["ingredients", "batches", id],
  history: (id, params) => ["ingredients", "history", id, params],
  reorderSuggestions: ["reorderSuggestions"],
  wasteReductions: ["wasteReductions"],
};

/* ── Query Hooks ───────────────────────────────── */

/**
 * useIngredientList — paginated active ingredients.
 * @param {object} params - { page, limit, search, status, sortBy, sortDir }
 */
export function useIngredientList(params) {
  return useQuery({
    queryKey: ingredientKeys.list(params),
    queryFn: () => api.getIngredientsRequest(params),
  });
}

/**
 * useIngredientArchived — paginated archived ingredients.
 * @param {object} params - { page, limit, search, sortBy, sortDir }
 */
export function useIngredientArchived(params) {
  return useQuery({
    queryKey: ingredientKeys.archived(params),
    queryFn: () => api.getArchivedIngredientsRequest(params),
  });
}

/**
 * useIngredientTable — combined list/archived query for IngredientTable.
 * Cannot call useIngredientList/useIngredientArchived conditionally (Rules of Hooks),
 * so this single hook handles both based on showArchived flag.
 * @param {object} params - query params
 * @param {boolean} showArchived - true to fetch archived, false for active
 */
export function useIngredientTable(params, showArchived) {
  return useQuery({
    queryKey: showArchived
      ? ingredientKeys.archived(params)
      : ingredientKeys.list(params),
    queryFn: () =>
      showArchived
        ? api.getArchivedIngredientsRequest(params)
        : api.getIngredientsRequest(params),
  });
}

/**
 * useIngredientSummary — KPI summary (total, healthy, low, out counts).
 * No params needed — always returns the full summary.
 */
export function useIngredientSummary() {
  return useQuery({
    queryKey: ingredientKeys.summary,
    queryFn: api.getIngredientSummaryRequest,
  });
}

/**
 * useIngredientAlerts — active stock alerts for sidebar.
 * No params needed — returns all active alerts.
 */
export function useIngredientAlerts() {
  return useQuery({
    queryKey: ingredientKeys.alerts,
    queryFn: api.getActiveAlertsRequest,
  });
}

/**
 * useIngredientBatches — restock batches for an ingredient.
 * Used by both ExpandedRow (simple) and BatchListModal (paginated + conditional).
 *
 * @param {string} id - ingredient UUID
 * @param {object} [params] - { page, limit, search, sortBy, sortDir } for paginated use
 * @param {object} [options] - additional useQuery options (e.g. { enabled: false })
 *   - BatchListModal passes { enabled: open && !!id && activeTab === "batches" }
 *   - ExpandedRow passes nothing (always enabled)
 */
export function useIngredientBatches(id, params = {}, options = {}) {
  return useQuery({
    // When params has page/limit (paginated), append to key for cache separation
    queryKey: params.page
      ? [...ingredientKeys.batches(id), params]
      : ingredientKeys.batches(id),
    queryFn: () => api.getIngredientBatchesRequest(id, params),
    ...options,
  });
}

/**
 * useIngredientHistory — adjustment history for an ingredient.
 * Used by BatchListModal with pagination, search, and type filter.
 *
 * @param {string} id - ingredient UUID
 * @param {object} [params] - { page, limit, search, sortBy, sortDir, type }
 * @param {object} [options] - additional useQuery options (e.g. { enabled: false })
 */
export function useIngredientHistory(id, params = {}, options = {}) {
  return useQuery({
    queryKey: params.page
      ? ingredientKeys.history(id, params)
      : ["ingredients", "history", id],
    queryFn: () => api.getAdjustmentHistoryRequest(id, params),
    ...options,
  });
}

/**
 * useReorderSuggestions — pending reorder suggestions.
 */
export function useReorderSuggestions() {
  return useQuery({
    queryKey: ingredientKeys.reorderSuggestions,
    queryFn: api.getReorderSuggestionsRequest,
  });
}

/**
 * useWasteReductions — pending waste reduction insights.
 */
export function useWasteReductions() {
  return useQuery({
    queryKey: ingredientKeys.wasteReductions,
    queryFn: api.getWasteReductionsRequest,
  });
}

/* ── Mutation Hook ─────────────────────────────── */

/**
 * useIngredientMutations — all CRUD + batch mutations.
 *
 * Each mutation's onSuccess handles cache invalidation only.
 * Components pass their own onSuccess/onError via .mutate() for toast + UI state.
 *
 * Usage:
 *   const mutations = useIngredientMutations();
 *   mutations.create.mutate(data, {
 *     onSuccess: () => { toast.success("Created"); closeModal(); },
 *     onError: (err) => { toast.error(err.message); },
 *   });
 *
 * @returns {object} - { create, update, restock, loss, archive, restore, remove, togglePriority, followFifo, generateReorder, acceptReorder, rejectReorder, generateWaste, acceptWaste, rejectWaste }
 */
export function useIngredientMutations() {
  const queryClient = useQueryClient();

  /** Invalidate all ingredient queries (list, archived, summary, alerts, batches, history) */
  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ingredientKeys.all });
  }

  /** Invalidate reorder suggestions */
  function invalidateReorder() {
    queryClient.invalidateQueries({ queryKey: ingredientKeys.reorderSuggestions });
  }

  /** Invalidate waste reductions */
  function invalidateWaste() {
    queryClient.invalidateQueries({ queryKey: ingredientKeys.wasteReductions });
  }

  return {
    /** Create ingredient — invalidates all ingredient queries */
    create: useMutation({
      mutationFn: api.createIngredientRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Update ingredient — invalidates all ingredient queries */
    update: useMutation({
      mutationFn: ({ id, data }) => api.updateIngredientRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),

    /** Restock ingredient — invalidates all ingredient queries */
    restock: useMutation({
      mutationFn: ({ id, data }) => api.restockIngredientRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),

    /** Declare loss — invalidates all ingredient queries */
    loss: useMutation({
      mutationFn: ({ id, data }) => api.declareLossRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),

    /** Archive ingredient — invalidates all ingredient queries */
    archive: useMutation({
      mutationFn: api.archiveIngredientRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Restore ingredient — invalidates all ingredient queries */
    restore: useMutation({
      mutationFn: api.restoreIngredientRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Delete ingredient permanently — invalidates all ingredient queries */
    remove: useMutation({
      mutationFn: api.deleteIngredientRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Toggle batch priority (star) — invalidates batches for that ingredient */
    togglePriority: useMutation({
      mutationFn: ({ ingredientId, batchId, isPriority }) =>
        api.toggleBatchPriorityRequest(ingredientId, batchId, isPriority),
      onSuccess: (_data, vars) => {
        queryClient.invalidateQueries({
          queryKey: ingredientKeys.batches(vars.ingredientId),
        });
      },
    }),

    /** Follow FIFO — clear all stars, set FIFO leader — invalidates batches for that ingredient */
    followFifo: useMutation({
      mutationFn: (ingredientId) => api.followFifoRequest(ingredientId),
      onSuccess: (_data, ingredientId) => {
        queryClient.invalidateQueries({
          queryKey: ingredientKeys.batches(ingredientId),
        });
      },
    }),

    // ── Reorder Suggestions ───────────────────────

    /** Generate reorder suggestions via AI */
    generateReorder: useMutation({
      mutationFn: api.generateReorderSuggestionsRequest,
      onSuccess: () => invalidateReorder(),
    }),

    /** Accept a reorder suggestion */
    acceptReorder: useMutation({
      mutationFn: api.acceptReorderSuggestionRequest,
      onSuccess: () => invalidateReorder(),
    }),

    /** Reject a reorder suggestion */
    rejectReorder: useMutation({
      mutationFn: api.rejectReorderSuggestionRequest,
      onSuccess: () => invalidateReorder(),
    }),

    // ── Waste Reduction ───────────────────────────

    /** Generate waste reduction insights via AI */
    generateWaste: useMutation({
      mutationFn: api.generateWasteReductionsRequest,
      onSuccess: () => invalidateWaste(),
    }),

    /** Accept a waste reduction insight */
    acceptWaste: useMutation({
      mutationFn: api.acceptWasteReductionRequest,
      onSuccess: () => invalidateWaste(),
    }),

    /** Reject a waste reduction insight */
    rejectWaste: useMutation({
      mutationFn: api.rejectWasteReductionRequest,
      onSuccess: () => invalidateWaste(),
    }),
  };
}
