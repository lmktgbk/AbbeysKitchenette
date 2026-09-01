import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

export const forecastKeys = {
  all: ["forecasting"],
  demandStatus: (jobId) => ["forecasting", "demand", "status", jobId],
  demandResults: (jobId) => ["forecasting", "demand", "results", jobId],
  demandHistory: ["forecasting", "demand", "history"],
  demandIngredients: (jobId) => ["forecasting", "demand", "ingredients", jobId],
};

export function useRunDemandForecast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.runDemandForecast(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: forecastKeys.demandHistory });
    },
  });
}

export function useDemandStatus(jobId, options = {}) {
  return useQuery({
    queryKey: forecastKeys.demandStatus(jobId),
    queryFn: () => api.getDemandStatus(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data?.data;
      if (data?.status === "completed" || data?.status === "failed" || data?.status === "not_found") {
        return false;
      }
      return 2000;
    },
    ...options,
  });
}

export function useDemandResults(jobId, options = {}) {
  return useQuery({
    queryKey: forecastKeys.demandResults(jobId),
    queryFn: () => api.getDemandResults(jobId),
    enabled: !!jobId,
    retry: false,
    ...options,
  });
}

export function useDemandHistory() {
  return useQuery({
    queryKey: forecastKeys.demandHistory,
    queryFn: api.getDemandHistory,
    retry: false,
  });
}

export function useDemandIngredients(jobId, options = {}) {
  return useQuery({
    queryKey: forecastKeys.demandIngredients(jobId),
    queryFn: () => api.getDemandIngredients(jobId),
    enabled: !!jobId,
    retry: false,
    ...options,
  });
}
