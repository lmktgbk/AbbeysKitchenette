import { guestKeys } from "@/features/orders/guestKeys";

export const productRefreshKeys = [["products"], ["categories"], guestKeys.menus];

export function invalidateTopicQueries(queryClient, keys) {
  for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
}
