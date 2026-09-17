import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getActiveCountRequest,
  startCountRequest,
  submitCountRequest,
  getCountRequest,
  listCountsRequest,
  getCountSummaryRequest,
} from "./api";

const COUNT_KEYS = {
  all: ["inventoryCounts"],
  active: () => [...COUNT_KEYS.all, "active"],
  detail: (id) => [...COUNT_KEYS.all, id],
  list: (params) => [...COUNT_KEYS.all, "list", params],
  summary: (id) => [...COUNT_KEYS.all, id, "summary"],
};

export function useActiveCount() {
  return useQuery({
    queryKey: COUNT_KEYS.active(),
    queryFn: getActiveCountRequest,
    select: (res) => res.data.count,
    staleTime: 5_000,
    retry: false,
  });
}

export function useStartCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startCountRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COUNT_KEYS.active() });
    },
  });
}

export function useSubmitCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => submitCountRequest(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COUNT_KEYS.all });
    },
  });
}

export function useCountDetail(id, enabled = true) {
  return useQuery({
    queryKey: COUNT_KEYS.detail(id),
    queryFn: () => getCountRequest(id),
    select: (res) => res.data.count,
    enabled: !!id && enabled,
  });
}

export function useCountList(params, enabled = true) {
  return useQuery({
    queryKey: COUNT_KEYS.list(params),
    queryFn: () => listCountsRequest(params),
    select: (res) => res.data,
    enabled,
  });
}

export function useCountSummary(id, enabled = true) {
  return useQuery({
    queryKey: COUNT_KEYS.summary(id),
    queryFn: () => getCountSummaryRequest(id),
    select: (res) => res.data.summary,
    enabled: !!id && enabled,
  });
}
