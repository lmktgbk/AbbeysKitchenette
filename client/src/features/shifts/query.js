import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getActiveShiftRequest,
  startShiftRequest,
  endShiftRequest,
  listShiftsRequest,
  getShiftRequest,
  getReconciliationRequest,
} from "./api";

const SHIFT_KEYS = {
  all: ["shifts"],
  active: () => [...SHIFT_KEYS.all, "active"],
  detail: (id) => [...SHIFT_KEYS.all, id],
  list: (params) => [...SHIFT_KEYS.all, "list", params],
  reconciliation: (params) => [...SHIFT_KEYS.all, "reconciliation", params],
};

export function useActiveShift() {
  return useQuery({
    queryKey: SHIFT_KEYS.active(),
    queryFn: getActiveShiftRequest,
    select: (res) => res.data.shift,
    staleTime: 10_000,
    retry: false,
  });
}

export function useStartShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: startShiftRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHIFT_KEYS.active() });
    },
  });
}

export function useEndShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => endShiftRequest(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHIFT_KEYS.active() });
      qc.invalidateQueries({ queryKey: SHIFT_KEYS.all });
    },
  });
}

export function useShiftDetail(id, enabled = true) {
  return useQuery({
    queryKey: SHIFT_KEYS.detail(id),
    queryFn: () => getShiftRequest(id),
    select: (res) => res.data.shift,
    enabled: !!id && enabled,
  });
}

export function useShiftList(params, enabled = true) {
  return useQuery({
    queryKey: SHIFT_KEYS.list(params),
    queryFn: () => listShiftsRequest(params),
    select: (res) => res.data,
    enabled,
  });
}

export function useReconciliation(params, enabled = true) {
  return useQuery({
    queryKey: SHIFT_KEYS.reconciliation(params),
    queryFn: () => getReconciliationRequest(params),
    select: (res) => res.data,
    enabled,
  });
}
