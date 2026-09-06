/**
 * Order Query Layer
 *
 * Centralized query + mutation hooks for the orders feature.
 * Components import hooks, not API functions.
 *
 * Structure:
 * - orderKeys: internal key factory (not exported)
 * - Query hooks: useOrderList, useOrderStats, useOrderDetail, useGuestMenu, usePendingOnlineOrders
 * - Mutation hooks: useOrderMutations, useGuestOrderMutations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factories (internal) ──────────────────── */

const orderKeys = {
  all: ["orders"],
  list: (params) => ["orders", "list", params],
  stats: ["orders", "stats"],
  detail: (id) => ["orders", "detail", id],
};

const guestKeys = {
  menu: (params) => ["guest", "menu", params],
};

/* ── Query Hooks ───────────────────────────────── */

/**
 * useOrderList — paginated order list.
 * @param {object} params - { page, limit, search, status, date_from, date_to, sortBy, sortDir }
 */
export function useOrderList(params) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => api.getOrdersRequest(params),
  });
}

/**
 * useOrderStats — KPI status counts.
 * Auto-refreshes every 30s for live dashboard.
 */
export function useOrderStats() {
  return useQuery({
    queryKey: orderKeys.stats,
    queryFn: api.getOrderStatsRequest,
    refetchInterval: 30000,
  });
}

/**
 * useOrderDetail — single order with items and timeline.
 * @param {string} id - order UUID
 * @param {object} [options] - additional useQuery options
 */
export function useOrderDetail(id, options = {}) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => api.getOrderDetailRequest(id),
    enabled: !!id,
    ...options,
  });
}

/**
 * useGuestMenu — available products for POS menu.
 * @param {object} [params] - { search, category }
 */
export function useGuestMenu(params = {}) {
  return useQuery({
    queryKey: guestKeys.menu(params),
    queryFn: () => api.getGuestMenuRequest(params),
  });
}

/**
 * usePendingOnlineOrders — pending online orders for POS.
 * Polls every 15s for real-time notification.
 */
export function usePendingOnlineOrders() {
  return useQuery({
    queryKey: orderKeys.list({ status: "pending", limit: "10" }),
    queryFn: () => api.getOrdersRequest({ status: "pending", limit: "10" }),
    refetchInterval: 15000,
  });
}

/* ── Mutation Hooks ─────────────────────────────── */

/**
 * useOrderMutations — all order CRUD mutations.
 * Each mutation invalidates relevant queries.
 *
 * @returns {object} - { create, edit, advanceStatus, cancel, fulfill }
 */
export function useOrderMutations() {
  const queryClient = useQueryClient();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: orderKeys.all });
  }

  return {
    /** Create walk-in order — invalidates all order queries */
    create: useMutation({
      mutationFn: api.createOrderRequest,
      onSuccess: () => invalidateAll(),
    }),

    /** Edit pending order — invalidates list + detail */
    edit: useMutation({
      mutationFn: ({ id, data }) => api.editOrderRequest(id, data),
      onSuccess: (_data, vars) => {
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(vars.id) });
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
      },
    }),

    /** Advance order status — invalidates all */
    advanceStatus: useMutation({
      mutationFn: ({ id, data }) => api.advanceOrderStatusRequest(id, data),
      onSuccess: (_data, vars) => {
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(vars.id) });
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
      },
    }),

    /** Cancel/delete order — invalidates all */
    cancel: useMutation({
      mutationFn: ({ id, data }) => api.cancelOrderRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),

    /** Fulfill pending online order — invalidates all */
    fulfill: useMutation({
      mutationFn: ({ id, data }) => api.fulfillOrderRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),
  };
}

/**
 * useGuestOrderMutations — guest order placement.
 *
 * @returns {object} - { placeOrder }
 */
export function useGuestOrderMutations() {
  return {
    placeOrder: useMutation({
      mutationFn: api.placeGuestOrderRequest,
    }),
  };
}
