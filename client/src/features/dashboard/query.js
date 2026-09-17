/**
 * Dashboard Query Layer
 *
 * Centralized query hooks for the dashboard feature.
 * Components import hooks, not API functions.
 */

import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

/* ── Key Factory (internal) ────────────────────── */

const dashboardKeys = {
  all: ["dashboard"],
  data: (params) => ["dashboard", "data", params],
  today: () => ["dashboard", "today"],
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
  });
}

/**
 * useTodayDashboard — today-only dashboard data.
 */
export function useTodayDashboard() {
  return useQuery({
    queryKey: dashboardKeys.today(),
    queryFn: () => api.getTodayDashboardRequest(),
    refetchInterval: 60_000,
  });
}
