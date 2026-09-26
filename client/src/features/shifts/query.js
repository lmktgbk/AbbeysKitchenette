/**
 * Shifts Queries — owns drawer-session list / detail / summary hooks + open/close mutations (BR-02).
 * WHY: centralizes live drawer updates so banners and reconciliation stay fresh. Keys: ["shifts", ...] (mine + list + stats + summary(id) + history, orders(id, params) keepPreviousData, ingredientUsage(id)); refreshed by server-pushed invalidations (realtime/subscriptions); mutations invalidate ["shifts"]; otherwise global staleTime 5m.
 * State: TanStack Query hooks only, no local state; invalidation via useQueryClient.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factories (internal) ──────────────────── */

const shiftKeys = {
  all: ["shifts"],
  mine: ["shifts", "mine"],
  history: ["shifts", "history"],
  list: (params) => ["shifts", "list", params],
  detail: (id) => ["shifts", "detail", id],
  summary: (id) => ["shifts", "summary", id],
  orders: (id, params) => ["shifts", "orders", id, params],
  ingredientUsage: (id) => ["shifts", "ingredientUsage", id],
};

export { shiftKeys };

/* ── Query Hooks ───────────────────────────────── */

/**
 * useMyShifts — own open shifts with live expected cash.
 * Live via server-pushed invalidations (ShiftBanner subscribes "shifts").
 */
export function useMyShifts() {
  return useQuery({
    queryKey: shiftKeys.mine,
    queryFn: api.getMyShiftsRequest,
  });
}

/**
 * useShiftsList — admin shift history with filters.
 * Live via server-pushed invalidations (ShiftsView subscribes "shifts").
 */
export function useShiftsList(params, options = {}) {
  return useQuery({
    queryKey: shiftKeys.list(params),
    queryFn: () => api.getShiftsRequest(params),
    ...options,
  });
}

/**
 * useShiftSummary — reconciliation breakdown for review/close.
 * Fetched on demand (enabled when a shift id is selected).
 * Live while the close modal is open — the drawer subscribes "shifts"
 * (sessions) and "orders" (sales moving behind the summary).
 */
export function useShiftSummary(id, options = {}) {
  return useQuery({
    queryKey: shiftKeys.summary(id),
    queryFn: () => api.getShiftSummaryRequest(id),
    enabled: !!id,
    ...options,
  });
}

/**
 * useMyHistory — own closed shifts (personal history).
 */
export function useMyHistory(options = {}) {
  return useQuery({
    queryKey: shiftKeys.history,
    queryFn: api.getMyHistoryRequest,
    ...options,
  });
}

/**
 * useShiftStats — period aggregates for the Shifts KPI row.
 * Live via server-pushed invalidations (drawer subscribes "shifts").
 */
export function useShiftStats(params = {}, options = {}) {
  return useQuery({
    queryKey: ["shifts", "stats", params],
    queryFn: () => api.getShiftStatsRequest(params),
    ...options,
  });
}

/**
 * useShiftOrders — windowed orders of one shift (for the detail drawer).
 */
export function useShiftOrders(id, params = {}, options = {}) {
  return useQuery({
    queryKey: shiftKeys.orders(id, params),
    queryFn: () => api.getShiftOrdersRequest(id, params),
    enabled: !!id,
    keepPreviousData: true,
    ...options,
  });
}

/**
 * useShiftIngredientUsage — ingredient usage totals separated by area
 */
export function useShiftIngredientUsage(id, options = {}) {
  return useQuery({
    queryKey: shiftKeys.ingredientUsage(id),
    queryFn: () => api.getShiftIngredientUsageRequest(id),
    enabled: !!id,
    ...options,
  });
}

/* ── Mutation Hooks ─────────────────────────────── */

export function useShiftMutations() {
  const queryClient = useQueryClient();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: shiftKeys.all });
  }

  return {
    open: useMutation({
      mutationFn: api.openShiftRequest,
      onSuccess: () => invalidateAll(),
    }),
    close: useMutation({
      mutationFn: ({ id, data }) => api.closeShiftRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),
    forceClose: useMutation({
      mutationFn: ({ id, data }) => api.forceCloseShiftRequest(id, data),
      onSuccess: () => invalidateAll(),
    }),
  };
}
