/**
 * Staff Queries — owns staff list / detail / summary hooks + CRUD mutations.
 * WHY: centralizes staff cache so admin tables stay consistent after edits. Keys: ["staff", ...] (list(params) with keepPreviousData, detail(id) enabled !!id, summary); all mutations invalidate ["staff"]; otherwise global staleTime 5m.
 * State: TanStack Query hooks only, no local state; invalidation via useQueryClient.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./api";

const staffKeys = {
  all: ["staff"],
  list: (params) => [...staffKeys.all, "list", params],
  detail: (id) => [...staffKeys.all, "detail", id],
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

export function useStaffSummary() {
  return useQuery({
    queryKey: [...staffKeys.all, "summary"],
    queryFn: api.getStaffSummaryRequest,
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
    remove: useMutation({
      mutationFn: api.deleteStaffRequest,
      onSuccess: invalidateAll,
    }),
  };
}
