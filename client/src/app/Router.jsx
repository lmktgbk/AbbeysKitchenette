/**
 * Router — React Router v7 with createBrowserRouter.
 *
 * Route structure:
 *   /                → Landing page (public)
 *   /login           → Login (public, redirect if logged in)
 *   /forgot-password → Forgot password (public)
 *   /reset-password  → Reset password from link (public)
 *   /change-pin      → Change PIN after mustChangePwd (protected)
 *   /dashboard       → Dashboard (protected, admin layout)
 *   /pos             → POS (protected, full-screen)
 *   /kitchen         → Kitchen display (protected, full-screen)
 */
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { PublicRoute } from "./PublicRoute";
import AuthLayout from "@/layouts/AuthLayout";
import AdminLayout from "@/layouts/AdminLayout";
import BlankLayout from "@/layouts/BlankLayout";
import LandingPage from "@/features/landing/pages/LandingPage";
import LoginPage from "@/features/auth/pages/LoginPage";
import ForgotPasswordPage from "@/features/auth/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/features/auth/pages/ResetPasswordPage";
import ChangePinPage from "@/features/auth/pages/ChangePinPage";

/* ── Placeholder Pages ───────────────── */

function DashboardPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Dashboard</h1></div>;
}
function PosPlaceholder() {
    return <div className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">POS</h1></div>;
}
function KitchenPlaceholder() {
    return <div className="flex h-screen items-center justify-center"><h1 className="text-2xl font-bold">Kitchen Display</h1></div>;
}

/* ── Router ──────────────────────────── */

const router = createBrowserRouter([
    // Landing Page (public, root route)
    {
        path: "/",
        element: <LandingPage />,
    },

    // Public — AuthLayout (centered card)
    {
        element: <AuthLayout />,
        children: [
            {
                path: "/login",
                element: (
                    <PublicRoute>
                        <LoginPage />
                    </PublicRoute>
                ),
            },
            { path: "/forgot-password", element: <ForgotPasswordPage /> },
            { path: "/reset-password", element: <ResetPasswordPage /> },
        ],
    },

    // Protected — AdminLayout (sidebar + header)
    {
        element: (
            <ProtectedRoute>
                <AdminLayout />
            </ProtectedRoute>
        ),
        children: [
            { path: "/dashboard", element: <DashboardPlaceholder /> },
        ],
    },

    // Protected — BlankLayout (full-screen)
    {
        element: (
            <ProtectedRoute>
                <BlankLayout />
            </ProtectedRoute>
        ),
        children: [
            { path: "/pos", element: <PosPlaceholder /> },
            { path: "/kitchen", element: <KitchenPlaceholder /> },
            { path: "/change-pin", element: <ChangePinPage /> },
        ],
    },

    // 404
    {
        path: "*",
        element: (
            <div className="flex min-h-screen items-center justify-center">
                <h1 className="text-2xl font-bold">404 — Page Not Found</h1>
            </div>
        ),
    },
]);

export function Router() {
    return <RouterProvider router={router} />;
}