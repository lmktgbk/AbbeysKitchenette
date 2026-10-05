/**
 * Forecasting Queries — owns demand-forecast job lifecycle hooks.
 * WHY: centralizes async job updates so components don't manage intervals. Keys: ["forecasting", "demand", ...] (status(jobId), results(jobId), history, ingredients(jobId)); status refreshes via server-pushed job completion (realtime); run mutation invalidates demand history.
 * State: TanStack Query hooks only, no local state; invalidation via useQueryClient.
 */
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import { subscribeRealtime } from "@/realtime/socket";

export const forecastKeys = {
  all: ["forecasting"],
  demandStatus: (jobId) => ["forecasting", "demand", "status", jobId],
  demandResults: (jobId) => ["forecasting", "demand", "results", jobId],
  demandHistory: ["forecasting", "demand", "history"],
  demandIngredients: (jobId) => ["forecasting", "demand", "ingredients", jobId],
};

/** Starts a durable demand job; refreshing history exposes the returned run to job selection. */
export function useRunDemandForecast() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.runDemandForecast(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: forecastKeys.demandHistory });
    },
  });
}

/** Watches one job topic and polls while its last fetched status is running; caller options may override polling. */
export function useDemandStatus(jobId, options = {}) {
  const queryClient = useQueryClient();
  // Live progress: the server watches the ML job and pushes completion.
  useEffect(() => {
    if (!jobId) return undefined;
    return subscribeRealtime(`jobs:${jobId}`, () => {
      queryClient.invalidateQueries({ queryKey: forecastKeys.demandStatus(jobId) });
      queryClient.invalidateQueries({ queryKey: forecastKeys.demandHistory });
    });
  }, [queryClient, jobId]);
  return useQuery({
    queryKey: forecastKeys.demandStatus(jobId),
    queryFn: () => api.getDemandStatus(jobId),
    enabled: !!jobId,
    // Realtime invalidation is supplemented by polling only while the cached status is running.
    refetchInterval: (query) =>
      query?.state?.data?.data?.status === "running" ? 2000 : false,
    ...options,
  });
}

/** Fetches results for the selected job; automatic retry is disabled unless overridden by options. */
export function useDemandResults(jobId, options = {}) {
  return useQuery({
    queryKey: forecastKeys.demandResults(jobId),
    queryFn: () => api.getDemandResults(jobId),
    enabled: !!jobId,
    retry: false,
    ...options,
  });
}

/** Fetches selectable runs without automatic retry; the page owns selection and error presentation. */
export function useDemandHistory() {
  return useQuery({
    queryKey: forecastKeys.demandHistory,
    queryFn: api.getDemandHistory,
    retry: false,
  });
}

/** Fetches ingredient requirements separately from demand results using the same selected job identity. */
export function useDemandIngredients(jobId, options = {}) {
  return useQuery({
    queryKey: forecastKeys.demandIngredients(jobId),
    queryFn: () => api.getDemandIngredients(jobId),
    enabled: !!jobId,
    retry: false,
    ...options,
  });
}
