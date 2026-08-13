import { Navigate } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import PrimarySpinner from "@/components/ui/spinner";

/**
 * ProtectedRoute
 * Redirects to /login if not authenticated.
 */
export function ProtectedRoute({ children }) {
    const user = useAuthStore((s) => s.user);
    const loading = useAuthStore((s) => s.loading);

    if (loading) {
        return (
            <PrimarySpinner />
        );
    }

    if (!user) return <Navigate to="/login" replace />;
    return <>{children}</>;
}
