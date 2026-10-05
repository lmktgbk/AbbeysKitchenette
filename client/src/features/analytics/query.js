/**
 * Analytics query hooks retain their existing filter-dependent cache keys and
 * 30-second freshness. Realtime invalidation uses the analytics prefix;
 * exports remain direct requests rather than cached query results.
 */
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsKpisRequest, getVariantProfitabilityRequest, getWasteDetailsRequest } from "./api";

export function useAnalyticsKpis(params) {
  return useQuery({
    queryKey: ["analytics", "kpis", params],
    queryFn: () => getAnalyticsKpisRequest(params),
    staleTime: 30000,
  });
}

/** Keep the established variantProfit cache key so realtime analytics invalidation still covers this page. */
export function useVariantProfitability(params) {
  return useQuery({
    queryKey: ["analytics", "variantProfit", params],
    queryFn: () => getVariantProfitabilityRequest(params),
    staleTime: 30000,
  });
}

/** Cache each waste filter/page independently with the existing 30-second freshness policy. */
export function useWasteDetails(params) {
  return useQuery({
    queryKey: ["analytics", "wasteDetails", params],
    queryFn: () => getWasteDetailsRequest(params),
    staleTime: 30000,
  });
}
