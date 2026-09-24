/**
 * Analytics Queries — owns KPI dashboard hook.
 * WHY: keeps KPI param mapping and freshness rules out of charts. Keys: ["analytics", "kpis", params]; staleTime 30s override (fresher than global 5m for live KPIs); no mutations here (export is a direct API call).
 * State: TanStack Query hook only, no local state.
 */
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsKpisRequest } from "./api";

export function useAnalyticsKpis(params) {
  return useQuery({
    queryKey: ["analytics", "kpis", params],
    queryFn: () => getAnalyticsKpisRequest(params),
    staleTime: 30000,
  });
}
