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
