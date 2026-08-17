import { Navigate } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import PrimarySpinner from "@/components/ui/spinner";

/**
 * PublicRoute
 * Redirects to appropriate dashboard if already logged in.
 * Role-based redirect: admin → /dashboard, cashier → /pos, kitchen → /kitchen
 */
export function PublicRoute({ children }) {
    const user = useAuthStore((s) => s.user);
    const loading = useAuthStore((s) => s.loading);

    if (loading) {
        return (
            <PrimarySpinner />
        );
    }

    if (user) {
        switch (user.role) {
            case "admin": return <Navigate to="/dashboard" replace />;
            case "cashier": return <Navigate to="/pos" replace />;
            case "kitchen": return <Navigate to="/kitchen" replace />;
            default: return <Navigate to="/dashboard" replace />;
        }
    }

    return <>{children}</>;
}
