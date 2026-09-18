/**
 * Shift Query Layer (BR-02)
 *
 * Centralized query + mutation hooks for the shifts feature.
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
};

export { shiftKeys };

/* ── Query Hooks ───────────────────────────────── */

/**
 * useMyShifts — own open shifts with live expected cash.
 * Polls every 30s so the banner stays fresh during a shift.
 */
export function useMyShifts() {
  return useQuery({
    queryKey: shiftKeys.mine,
    queryFn: api.getMyShiftsRequest,
    refetchInterval: 30000,
  });
}

/**
 * useShiftsList — admin shift history with filters.
 */
export function useShiftsList(params, options = {}) {
  return useQuery({
    queryKey: shiftKeys.list(params),
    queryFn: () => api.getShiftsRequest(params),
    refetchInterval: 30000,
    ...options,
  });
}

/**
 * useShiftSummary — reconciliation breakdown for review/close.
 * Fetched on demand (enabled when a shift id is selected).
 */
export function useShiftSummary(id, options = {}) {
  return useQuery({
    queryKey: shiftKeys.summary(id),
    queryFn: () => api.getShiftSummaryRequest(id),
    enabled: !!id,
    // Live while the close modal is open — sales behind it keep moving.
    refetchInterval: 15000,
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
 */
export function useShiftStats(params = {}, options = {}) {
  return useQuery({
    queryKey: ["shifts", "stats", params],
    queryFn: () => api.getShiftStatsRequest(params),
    refetchInterval: 30000,
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
