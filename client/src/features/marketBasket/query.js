import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";
import { createProductRequest } from "@/features/products/api";

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
  return useQuery({
    queryKey: marketBasketKeys.job(jobId),
    queryFn: () => api.getMarketBasketJob(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data?.data;
      if (data?.status === "running") return 2000;
      return false;
    },
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
    },
  });
}
