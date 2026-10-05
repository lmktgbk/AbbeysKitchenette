import { guestKeys } from "@/features/orders/guestKeys";

// Product/category changes also affect the public/POS menu cache. Keep all
// three prefixes together so every consumer reads updated availability.
export const productRefreshKeys = [["products"], ["categories"], guestKeys.menus];

/** Mark matching query families stale; active observers refetch according to React Query policy. */
export function invalidateTopicQueries(queryClient, keys) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
}
