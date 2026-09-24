/**
 * Settings Queries — owns system-settings read + update hooks.
 * WHY: single cached source for global settings with toast feedback on save. Keys: ["settings"]; select unwraps res.data.settings; update mutation invalidates ["settings"]; otherwise global staleTime 5m.
 * State: TanStack Query hook + mutation only, no local state; invalidation via useQueryClient.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSettingsRequest, updateSettingsRequest } from "./api";

const settingsKeys = {
  all: ["settings"],
};

/** Fetch current settings */
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: getSettingsRequest,
    select: (res) => res.data.settings,
  });
}

/** Update settings mutation */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSettingsRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      toast.success("Settings saved");
    },
    onError: (err) => {
      const msg = err.response?.data?.message || "Failed to save settings";
      toast.error(msg);
    },
  });
}
