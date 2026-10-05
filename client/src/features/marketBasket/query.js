/**
 * MarketBasket Queries — owns MBA job history / job polling / combo-creation hooks.
 * WHY: hides async analysis updates and product-creation chaining from promo UI. Keys: ["marketBasket", ...] (jobs, job(id) refreshed by server-pushed completion); analyze invalidates jobs/job(jobId); create-combo invalidates ["products"] + ["marketBasket"].
 * State: TanStack Query hooks only, no local state; invalidation via useQueryClient.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import { createProductRequest } from "@/features/products/api";
import { subscribeRealtime } from "@/realtime/socket";

const marketBasketKeys = {
  all: ["marketBasket"],
  jobs: ["marketBasket", "jobs"],
  job: (id) => ["marketBasket", "job", id],
};

function useMarketBasketJobs(limit = 20) {
  return useQuery({
    queryKey: marketBasketKeys.jobs,
    queryFn: () => api.getMarketBasketJobs(limit),
  });
}

export function useMarketBasketJob(jobId) {
  const queryClient = useQueryClient();
  // Live progress: the server watches the ML job and pushes completion.
  useEffect(() => {
    if (jobId == null) return undefined;
    return subscribeRealtime(`jobs:${jobId}`, () => {
      queryClient.invalidateQueries({ queryKey: marketBasketKeys.job(jobId) });
      queryClient.invalidateQueries({ queryKey: marketBasketKeys.jobs });
    });
  }, [queryClient, jobId]);
  return useQuery({
    queryKey: marketBasketKeys.job(jobId),
    queryFn: () => api.getMarketBasketJob(jobId),
    enabled: !!jobId,
    // Realtime broadcast is primary; 2s polling is backup while running
    // while cached job status is running; absent initial data does not enable this fallback.
    refetchInterval: (query) =>
      query?.state?.data?.data?.status === "running" ? 2000 : false,
  });
}

export function useLatestMBAJob() {
  const jobsQuery = useMarketBasketJobs(1);
  const latestJobId = jobsQuery.data?.data?.[0]?.id;
  const jobQuery = useMarketBasketJob(latestJobId);

  // Only show loading skeleton on initial load, not background refetches
  const isLoading = jobsQuery.isInitialLoading || (latestJobId && jobQuery.isInitialLoading);

  return {
    job: jobQuery.data?.data || null,
    isLoading,
    isRefetching: jobsQuery.isFetching || jobQuery.isFetching,
    error: jobsQuery.error || jobQuery.error,
  };
}

export function useAnalyzeMarketBasket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.analyzeMarketBasketRequest,
    onSuccess: (data) => {
      const jobId = data?.data?.job_id;
      if (jobId) {
        queryClient.invalidateQueries({ queryKey: marketBasketKeys.jobs });
        queryClient.invalidateQueries({ queryKey: marketBasketKeys.job(jobId) });
      }
    },
  });
}

/** Create the product, then associate its recommendation in a separate request.
 * Association failure can follow a successful product save; these writes are not atomic.
 */
export function useCreateComboProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => {
      const productRes = await createProductRequest(payload);
      const productId = productRes?.data?.product?.product_id;
      if (productId && payload._comboPair) {
        await api.markComboCreatedRequest({
          product_name_a: payload._comboPair.product_name_a,
          product_name_b: payload._comboPair.product_name_b,
          product_id: productId,
        });
      }
      return productRes;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: marketBasketKeys.all });
      // Bundle auto-creates the Bundles/Bundle subcategory — refresh category lists too.
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
