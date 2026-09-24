/**
 * Dashboard Queries — owns consolidated dashboard + revenue-trend hooks.
 * WHY: splits revenue trend from the main payload so granularity changes don't refetch everything. Keys: ["dashboard", "data", params] and ["dashboard", "revenueTrend", params]; both staleTime 30s override (fresher than global 5m); read-only.
 * State: TanStack Query hooks only, no local state or mutations.
 */

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factory (internal) ────────────────────── */

const dashboardKeys = {
  all: ["dashboard"],
  data: (params) => ["dashboard", "data", params],
  revenueTrend: (params) => ["dashboard", "revenueTrend", params],
};

/* ── Query Hooks ───────────────────────────────── */

/**
 * useDashboardData — consolidated dashboard analytics.
 * @param {object} params - { dateFrom, dateTo }
 */
export function useDashboardData(params) {
  return useQuery({
    queryKey: dashboardKeys.data(params),
    queryFn: () => api.getDashboardRequest(params),
    staleTime: 30000,
  });
}

/**
 * useRevenueTrend — revenue trend with granularity.
 * Separate from main dashboard to avoid refetching everything on granularity change.
 * @param {object} params - { dateFrom, dateTo, granularity }
 */
export function useRevenueTrend(params) {
  return useQuery({
    queryKey: dashboardKeys.revenueTrend(params),
    queryFn: () => api.getRevenueTrendRequest(params),
    staleTime: 30000,
  });
}
