import { Navigate } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import PrimarySpinner from "@/components/ui/spinner";

/**
 * PublicRoute
 * Redirects to /dashboard if already logged in.
 */
export function PublicRoute({ children }) {
    const user = useAuthStore((s) => s.user);
    const loading = useAuthStore((s) => s.loading);

    if (loading) {
        return (
            <PrimarySpinner />
        );
    }

    if (user) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
}