import { useQuery } from "@tanstack/react-query";
import * as api from "./api";

const forecastKeys = {
  all: ["forecasting"],
  sales: (params) => ["forecasting", "sales", params],
  restock: ["forecasting", "restock"],
  popularity: (params) => ["forecasting", "popularity", params],
};

export function useSalesForecast(params = {}) {
  return useQuery({
    queryKey: forecastKeys.sales(params),
    queryFn: () => api.getSalesForecastRequest(params),
    retry: false,
  });
}

export function useRestockForecast() {
  return useQuery({
    queryKey: forecastKeys.restock,
    queryFn: api.getRestockForecastRequest,
    retry: false,
  });
}

export function usePopularity(params = {}) {
  return useQuery({
    queryKey: forecastKeys.popularity(params),
    queryFn: () => api.getPopularityRequest(params),
    retry: false,
  });
}
