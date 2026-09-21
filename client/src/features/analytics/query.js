import { useQuery } from "@tanstack/react-query";
import { getAnalyticsKpisRequest } from "./api";

export function useAnalyticsKpis(params) {
  return useQuery({
    queryKey: ["analytics", "kpis", params],
    queryFn: () => getAnalyticsKpisRequest(params),
    staleTime: 30000,
  });
}
