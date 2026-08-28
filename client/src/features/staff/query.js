import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

const staffKeys = {
  all: ["staff"],
  list: (params) => [...staffKeys.all, "list", params],
  detail: (id) => [...staffKeys.all, "detail", id],
  performance: (params) => [...staffKeys.all, "performance", params],
};

export function useStaffList(params) {
  return useQuery({
    queryKey: staffKeys.list(params),
    queryFn: () => api.getStaffListRequest(params),
    keepPreviousData: true,
  });
}

export function useStaffDetail(id) {
  return useQuery({
    queryKey: staffKeys.detail(id),
    queryFn: () => api.getStaffRequest(id),
    enabled: !!id,
  });
}

export function useStaffPerformance(params) {
  return useQuery({
    queryKey: staffKeys.performance(params),
    queryFn: () => api.getStaffPerformanceRequest(params),
  });
}

export function useStaffMutations() {
  const queryClient = useQueryClient();

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: staffKeys.all });
  }

  return {
    create: useMutation({
      mutationFn: api.createStaffRequest,
      onSuccess: invalidateAll,
    }),
    update: useMutation({
      mutationFn: ({ id, data }) => api.updateStaffRequest(id, data),
      onSuccess: invalidateAll,
    }),
    toggleActive: useMutation({
      mutationFn: api.toggleActiveStaffRequest,
      onSuccess: invalidateAll,
    }),
    resetPin: useMutation({
      mutationFn: ({ id, data }) => api.resetPinStaffRequest(id, data),
      onSuccess: invalidateAll,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, data }) => api.resetPasswordStaffRequest(id, data),
      onSuccess: invalidateAll,
    }),
    remove: useMutation({
      mutationFn: api.deleteStaffRequest,
      onSuccess: invalidateAll,
    }),
  };
}
