/**
 * Landing Queries — owns public store-settings hook.
 * WHY: caches rarely-changing public settings separately from authed data. Keys: ["landing", "storeSettings"]; staleTime 5m to avoid refetching static branding on every visit; no mutations.
 * State: TanStack Query hook only, no local state.
 */
import { useMemo } from "react";
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

/** Stored value for takeout orders (matches the dashboard fallback label). */
export const TAKEOUT_VALUE = "Takeout";

const FALLBACK_TABLES = {
  tables: Array.from({ length: 8 }, (_, i) => ({
    id: `t${i + 1}`,
    label: `Table ${i + 1}`,
    enabled: true,
  })),
  takeoutEnabled: true,
};

/**
 * Dining-table dropdown options from Settings (diningTables).
 * Falls back to Tables 1–8 + Takeout when unset. Used by the POS summary
 * and the guest checkout so both offer exactly the configured tables.
 */
export function useDiningTableOptions() {
  const { data: settingsData } = useStoreSettings();
  const config = settingsData?.data?.diningTables ?? FALLBACK_TABLES;
  return useMemo(() => {
    const tables = (config.tables ?? []).filter((t) => t.enabled);
    const options = tables.map((t) => ({ value: t.label, label: t.label }));
    if (config.takeoutEnabled !== false) {
      options.push({ value: TAKEOUT_VALUE, label: "Takeout" });
    }
    return options;
  }, [config]);
}
