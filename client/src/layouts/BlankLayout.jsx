import { Outlet } from "react-router-dom";

/**
 * BlankLayout
 * Full-screen layout with no sidebar, no header.
 * Used for POS and Kitchen Display.
 */
export default function BlankLayout() {
    return (
        <div className="min-h-screen bg-background">
            <Outlet />
        </div>
    );
}