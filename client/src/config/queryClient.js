import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient configuration
 * Shared across the app via QueryClientProvider in App.jsx.
 */
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
