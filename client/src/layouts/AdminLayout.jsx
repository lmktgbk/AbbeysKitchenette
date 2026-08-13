import { Outlet } from "react-router-dom";

/**
 * AdminLayout
 * Layout for admin pages — sidebar + header + main content area.
 * Renders child routes via Outlet.
 */
export default function AdminLayout() {
    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar placeholder — will be built later */}
            <aside className="hidden w-64 border-r p-4 lg:block">
                <p className="text-sm font-semibold">Abbey's Kitchenette</p>
            </aside>

            {/* Main content */}
            <main className="flex-1">
                <Outlet />
            </main>
        </div>
    );
}