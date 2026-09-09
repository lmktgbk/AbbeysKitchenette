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

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factories (internal) ──────────────────── */

const orderKeys = {
  all: ["orders"],
  list: (params) => ["orders", "list", params],
  stats: ["orders", "stats"],
  detail: (id) => ["orders", "detail", id],
  kitchenBatches: ["orders", "kitchen", "batches"],
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

/**
 * useKitchenBatchGroups — batch preparation groups for preparing orders.
 * Polls every 5s alongside kitchen display.
 */
export function useKitchenBatchGroups() {
  return useQuery({
    queryKey: orderKeys.kitchenBatches,
    queryFn: api.getKitchenBatchGroupsRequest,
    staleTime: 5000,
    refetchInterval: 5000,
  });
}

/**
 * useKitchenDisplay — kitchen display hook.
 * Polls every 5s, returns all active orders grouped by status.
 * Manages client-side item checked state (Map<orderId, Set<orderItemId>>).
 */
export function useKitchenDisplay() {
  const queryClient = useQueryClient();
  const [checkedItems, setCheckedItems] = useState(() => new Map());

  const { data, isLoading, isFetching } = useQuery({
    queryKey: orderKeys.list({ kitchen: true }),
    queryFn: () => api.getKitchenOrdersRequest(),
    staleTime: 5000,
    refetchInterval: 5000,
    retry: 1,
  });

  const orders = data?.data?.orders ?? [];

  const { preparing, accepted, completedToday } = useMemo(() => {
    const preparingOrders = orders
      .filter((o) => o.status === "preparing")
      .sort((a, b) => new Date(a.preparing_at || a.created_at) - new Date(b.preparing_at || b.created_at));
    const acceptedOrders = orders
      .filter((o) => o.status === "accepted")
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const completedOrders = orders.filter((o) => o.status === "completed");

    return {
      preparing: preparingOrders,
      accepted: acceptedOrders,
      completedToday: completedOrders,
    };
  }, [orders]);

  const markReady = useMutation({
    mutationFn: (id) => api.advanceOrderStatusRequest(id, { status: "completed" }),
    onSuccess: (_data, id) => {
      setCheckedItems((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });

  const toggleItemCheck = useCallback((orderId, orderItemId) => {
    setCheckedItems((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(orderId) ?? []);
      if (set.has(orderItemId)) set.delete(orderItemId);
      else set.add(orderItemId);
      next.set(orderId, set);
      return next;
    });
  }, []);

  const getCheckedSet = useCallback(
    (orderId) => checkedItems.get(orderId) ?? new Set(),
    [checkedItems],
  );

  return {
    loading: isLoading,
    refreshing: isFetching && !isLoading,
    preparing,
    accepted,
    completedToday,
    counts: {
      preparing: preparing.length,
      accepted: accepted.length,
    },
    toggleItemCheck,
    getCheckedSet,
    markReady: markReady.mutateAsync,
    markingReady: markReady.isPending,
  };
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

    /** Prepare order — transition accepted → preparing */
    prepare: useMutation({
      mutationFn: (id) => api.prepareOrderRequest(id),
      onSuccess: () => invalidateAll(),
    }),

    /** Check/uncheck order item */
    checkItem: useMutation({
      mutationFn: ({ orderId, itemId, data }) => api.checkOrderItemRequest(orderId, itemId, data),
      onSuccess: (_data, vars) => {
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(vars.orderId) });
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
      },
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
