/**
 * Landing Queries — owns public store-settings hook.
 * WHY: caches rarely-changing public settings separately from authed data. Keys: ["landing", "storeSettings"]; staleTime 5m to avoid refetching static branding on every visit; no mutations.
 * State: TanStack Query hook only, no local state.
 */
import { useQuery } from "@tanstack/react-query";
import { getStoreSettingsRequest } from "./api";

const landingKeys = {
  storeSettings: ["landing", "storeSettings"],
};

export function useStoreSettings() {
  return useQuery({
    queryKey: landingKeys.storeSettings,
    queryFn: getStoreSettingsRequest,
    staleTime: 5 * 60 * 1000,
  });
}
