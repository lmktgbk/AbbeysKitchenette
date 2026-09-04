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
 *   /products        → Products (protected, admin layout)
 *   /inventory       → Inventory (protected, admin layout)
 *   /pos             → POS terminal (protected, full-screen, nested)
 *   /pos/orders      → Orders view inside POS terminal
 *   /kitchen         → Kitchen display (protected, full-screen)
 *   /staff           → Staff (protected, admin layout)
 *   /forecasting     → Forecasting (protected, admin layout)
 *   /market-basket   → Market Basket (protected, admin layout)
 *   /audit-logs      → Audit Logs (protected, admin layout)
 *   /settings        → Settings (protected, admin layout)
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
import IngredientsPage from "@/features/ingredients/pages/InventoryPage";
import ProductsPage from "@/features/products/pages/ProductsPage";
import OrdersPage from "@/features/orders/pages/OrdersPage";
import PosTerminal from "@/features/orders/pages/PosTerminal";
import PosInterface from "@/features/orders/pages/PosInterface";
import StaffPage from "@/features/staff/pages/StaffPage";
import ForecastingPage from "@/features/forecasting/pages/ForecastingPage";
import MarketBasketPage from "@/features/marketBasket/pages/MarketBasketPage";

/* ── Placeholder Pages ───────────────── */

function DashboardPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Dashboard</h1></div>;
}
function ProductsPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Products</h1></div>;
}
function InventoryPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Inventory</h1></div>;
}
function StaffPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Staff</h1></div>;
}
function ForecastingPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Forecasting</h1></div>;
}
function AuditLogsPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Audit Logs</h1></div>;
}
function SettingsPlaceholder() {
    return <div className="p-6"><h1 className="text-2xl font-bold">Settings</h1></div>;
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
            {
                path: "/change-pin",
                element: (
                    <ProtectedRoute>
                        <ChangePinPage />
                    </ProtectedRoute>
                ),
            },
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
            { path: "/products", element: <ProductsPage /> },
            { path: "/inventory", element: <IngredientsPage /> },
            { path: "/orders", element: <OrdersPage /> },
            { path: "/inventory", element: <InventoryPlaceholder /> },
            { path: "/staff", element: <StaffPage /> },
            { path: "/forecasting", element: <ForecastingPage /> },
            { path: "/market-basket", element: <MarketBasketPage /> },
            { path: "/audit-logs", element: <AuditLogsPlaceholder /> },
            { path: "/settings", element: <SettingsPlaceholder /> },
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
                element: <PosTerminal />,
                children: [
                    { index: true, element: <PosInterface /> },
                    { path: "orders", element: <OrdersPage embedded /> },
                ],
            },
            { path: "/kitchen", element: <KitchenPlaceholder /> },
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
