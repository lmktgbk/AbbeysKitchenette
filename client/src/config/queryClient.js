/**
 * QueryClient — owns global TanStack Query defaults.
 * WHY: single place for global staleTime 5m + retry 1 + refetchOnWindowFocus false; per-query overrides (e.g. 30s KPIs, 15s/5s live feeds, 2s job polling) live in feature query modules and take precedence.
 * State: TanStack Query client shared via QueryClientProvider in App.jsx.
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
