/**
 * Shared query defaults: five-minute freshness, one retry, and no window-focus
 * refetch. Feature hooks override these policies where needed. Realtime events
 * invalidate matching query prefixes; disabling realtime does not create a
 * polling fallback through this configuration.
 */
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes before refetch
      retry: 1, // retry once on failure
      refetchOnWindowFocus: false, // don't refetch on tab switch
    },
  },
});

export default queryClient;
