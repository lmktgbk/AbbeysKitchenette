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
