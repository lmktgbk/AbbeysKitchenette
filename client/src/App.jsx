/**
 * App — root component with providers and router.
 *
 * Provider order:
 * 1. QueryClientProvider — TanStack Query (data fetching, caching)
 * 2. AuthProvider — session restore on mount
 * 3. Router — reads auth state for protected/public routes
 * 4. Toaster — global toast notifications
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import queryClient from "./config/queryClient";
import AuthProvider from "@/features/auth/AuthProvider";
import { Router } from "./app/Router";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster position="top-right" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;