import { useQuery } from "@tanstack/react-query";
import { getVariantProfitabilityRequest, getWasteDetailsRequest } from "./variantApi";

export function useVariantProfitability(params) {
  return useQuery({
    queryKey: ["analytics", "variantProfit", params],
    queryFn: () => getVariantProfitabilityRequest(params),
    staleTime: 30000,
  });
}

export function useWasteDetails(params) {
  return useQuery({
    queryKey: ["analytics", "wasteDetails", params],
    queryFn: () => getWasteDetailsRequest(params),
    staleTime: 30000,
  });
}
