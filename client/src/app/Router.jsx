/**
 * Router — React Router v7 with createBrowserRouter.
 *
 * Route structure:
 *   /                → Landing page (public)
 *   /login           → Staff login (cashier + kitchen, public, redirect if logged in)
 *   /admin-login     → Hidden admin login (admin only + OTP, public, never linked)
 *   /forgot-password → Forgot password (public, all roles, emailed reset link)
 *   /reset-password  → Reset password from link (public, all roles)
 *   /dashboard       → Dashboard (protected, admin layout)
 *   /products        → Products (protected, admin layout)
 *   /inventory       → Inventory (protected, admin layout)
 *   /pos             → POS terminal (protected, full-screen, nested)
 *   /pos/orders      → Orders view inside POS terminal
 *   /kitchen         → Kitchen display (protected, full-screen)
 *   /staff           → Staff (protected, admin layout)
 *   /forecasting     → Forecasting (protected, admin layout)
 *   /promotions     → Promotions (protected, admin layout) — formerly /market-basket
 *   /anomalies       → Anomalies (protected, admin layout)
 *   /audit-logs      → Audit Logs (protected, admin layout)
 *   /settings        → Settings (protected, admin layout)
 */
import { lazy } from "react";
import RouteContent from "./RouteContent";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { PublicRoute } from "./PublicRoute";
import AuthLayout from "@/layouts/AuthLayout";
const AdminLayout = lazy(() => import("@/layouts/AdminLayout"));
import BlankLayout from "@/layouts/BlankLayout";
const LandingPage = lazy(() => import("@/features/landing/pages/LandingPage"));
const OrderingPage = lazy(() => import("@/features/landing/pages/OrderingPage"));
const TrackingPage = lazy(() => import("@/features/landing/pages/TrackingPage"));
const PrivacyPolicy = lazy(() => import("@/features/landing/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/features/landing/pages/TermsOfService"));
const LoginPage = lazy(() => import("@/features/auth/pages/LoginPage"));
const AdminLoginPage = lazy(() => import("@/features/auth/pages/AdminLoginPage"));
const ForgotPasswordPage = lazy(() => import("@/features/auth/pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/features/auth/pages/ResetPasswordPage"));
const IngredientsPage = lazy(() => import("@/features/ingredients/pages/InventoryPage"));
const ProductsPage = lazy(() => import("@/features/products/pages/ProductsPage"));
const OrdersPage = lazy(() => import("@/features/orders/pages/OrdersPage"));
const PosTerminal = lazy(() => import("@/features/orders/pages/PosTerminal"));
const PosInterface = lazy(() => import("@/features/orders/pages/PosInterface"));
const StaffPage = lazy(() => import("@/features/staff/pages/StaffPage"));
const ForecastingPage = lazy(() => import("@/features/forecasting/pages/ForecastingPage"));
const MarketBasketPage = lazy(() => import("@/features/marketBasket/pages/MarketBasketPage"));
const AnomalyPage = lazy(() => import("@/features/anomalyDetection/pages/AnomalyPage"));
const SettingsPage = lazy(() => import("@/features/settings/pages/SettingsPage"));
const AuditLogsPage = lazy(() => import("@/features/auditLogs/pages/AuditLogsPage"));
const DashboardPage = lazy(() => import("@/features/dashboard/pages/DashboardPage"));
const KitchenDisplay = lazy(() => import("@/features/orders/pages/KitchenDisplay"));

/* ── Router ──────────────────────────── */

const router = createBrowserRouter([
    // Landing Page (public, root route)
    {
        path: "/",
        element: <RouteContent><LandingPage /></RouteContent>,
    },

    // Online Ordering Page (public, no auth required)
    {
        path: "/order",
        element: <RouteContent><OrderingPage /></RouteContent>,
    },

    // Guest order tracking (public, full token only)
    {
        path: "/track/:token",
        element: <RouteContent><TrackingPage /></RouteContent>,
    },

    // Privacy Policy & Terms of Service (public)
    {
        path: "/privacy-policy",
        element: <RouteContent><PrivacyPolicy /></RouteContent>,
    },
    {
        path: "/terms-of-service",
        element: <RouteContent><TermsOfService /></RouteContent>,
    },

    // Public — AuthLayout (centered card)
    {
        element: <AuthLayout />,
        children: [
            {
                path: "/login",
                element: (
                    <PublicRoute>
                        <RouteContent><LoginPage /></RouteContent>
                    </PublicRoute>
                ),
            },
            // Hidden admin portal — never linked in UI, only admins know it.
            {
                path: "/admin-login",
                element: (
                    <PublicRoute>
                        <RouteContent><AdminLoginPage /></RouteContent>
                    </PublicRoute>
                ),
            },
            { path: "/forgot-password", element: <RouteContent><ForgotPasswordPage /></RouteContent> },
            { path: "/reset-password", element: <RouteContent><ResetPasswordPage /></RouteContent> },
        ],
    },

    // Protected — AdminLayout (sidebar + header)
    {
        element: (
            <ProtectedRoute>
                <RouteContent><AdminLayout /></RouteContent>
            </ProtectedRoute>
        ),
        children: [
            { path: "/dashboard", element: <RouteContent><DashboardPage /></RouteContent> },
            { path: "/products", element: <RouteContent><ProductsPage /></RouteContent> },
            { path: "/inventory", element: <RouteContent><IngredientsPage /></RouteContent> },
            { path: "/orders", element: <RouteContent><OrdersPage /></RouteContent> },
            { path: "/staff", element: <RouteContent><StaffPage /></RouteContent> },
            { path: "/forecasting", element: <RouteContent><ForecastingPage /></RouteContent> },
            { path: "/promotions", element: <RouteContent><MarketBasketPage /></RouteContent> },
            { path: "/market-basket", element: <RouteContent><MarketBasketPage /></RouteContent> },
            { path: "/anomalies", element: <RouteContent><AnomalyPage /></RouteContent> },
            { path: "/audit-logs", element: <RouteContent><AuditLogsPage /></RouteContent> },
            { path: "/settings", element: <RouteContent><SettingsPage /></RouteContent> },
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
            {
                path: "/pos",
                element: <RouteContent><PosTerminal /></RouteContent>,
                children: [
                    { index: true, element: <RouteContent><PosInterface /></RouteContent> },
                    { path: "orders", element: <RouteContent><OrdersPage embedded /></RouteContent> },
                    { path: "kitchen", element: <RouteContent><KitchenDisplay embedded /></RouteContent> },
                ],
            },
            { path: "/kitchen", element: <RouteContent><KitchenDisplay /></RouteContent> },
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
