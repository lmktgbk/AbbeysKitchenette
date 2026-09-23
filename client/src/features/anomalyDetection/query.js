/**
 * AnomalyDetection Queries — owns anomaly results / active alerts / stats hooks.
 * WHY: keeps anomaly polling and ack/scan cache rules out of components. Keys: ["anomalies", ...] (results(params), active(severity), stats); active polls refetchInterval 15s; mutations invalidate ["anomalies"]; otherwise global staleTime 5m.
 * State: TanStack Query hooks only, no local state; invalidation via useQueryClient.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

const anomalyKeys = {
  all: ["anomalies"],
  results: (params) => ["anomalies", "results", params],
  active: (severity) => ["anomalies", "active", severity],
  stats: ["anomalies", "stats"],
};

export function useAnomalyResults(params = {}) {
  return useQuery({
    queryKey: anomalyKeys.results(params),
    queryFn: () => api.getAnomalyResults(params),
  });
}

export function useActiveAnomalies(severity = "critical,high") {
  return useQuery({
    queryKey: anomalyKeys.active(severity),
    queryFn: () => api.getActiveAnomalies(severity),
    refetchInterval: 15000,
  });
}

export function useAnomalyStats() {
  return useQuery({
    queryKey: anomalyKeys.stats,
    queryFn: api.getAnomalyStats,
  });
}

export function useAcknowledgeAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.acknowledgeAnomaly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyKeys.all });
    },
  });
}

export function useTriggerScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.triggerAnomalyScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: anomalyKeys.all });
    },
  });
}
