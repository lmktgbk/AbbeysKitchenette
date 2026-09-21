import { Navigate, useLocation } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import PrimarySpinner from "@/components/ui/spinner";

/**
 * ProtectedRoute
 * Redirects to /login if not authenticated.
 * Redirects to /reset-password if mustChangePwd is true.
 */
export function ProtectedRoute({ children }) {
    const user = useAuthStore((s) => s.user);
    const loading = useAuthStore((s) => s.loading);
    const location = useLocation();

    if (loading) {
        return (
            <PrimarySpinner />
        );
    }

    if (!user) return <Navigate to="/login" replace />;

    if (user.mustChangePwd && location.pathname !== "/reset-password" && location.pathname !== "/change-password") {
        return <Navigate to="/reset-password" replace />;
    }

    // Role-based route enforcement
    if (user.role === "kitchen" && location.pathname !== "/kitchen" && location.pathname !== "/reset-password" && location.pathname !== "/change-password") {
        return <Navigate to="/kitchen" replace />;
    }
    if (user.role === "cashier" && !location.pathname.startsWith("/pos") && location.pathname !== "/reset-password" && location.pathname !== "/change-password") {
        return <Navigate to="/pos" replace />;
    }

    return <>{children}</>;
}
