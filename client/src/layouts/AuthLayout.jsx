import { Outlet } from "react-router-dom";

/**
 * AuthLayout
 * Centered card layout for login, forgot password, reset password pages.
 * Uses warm gradient background with glassmorphism card.
 */
export default function AuthLayout() {
    return (
        <div className="auth-bg flex min-h-screen items-center justify-center p-4">
            <div className="w-full max-w-md animate-fade-in">
                <Outlet />
            </div>
        </div>
    );
}
