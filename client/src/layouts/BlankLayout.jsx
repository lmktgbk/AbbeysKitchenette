import { Outlet } from "react-router-dom";

/** BlankLayout — bare full-screen shell (no sidebar/header). WHY it exists: POS and Kitchen Display need a distraction-free canvas; consumed by POS/kitchen routes via Outlet. State: none. */
export default function BlankLayout() {
    return (
        <div className="min-h-screen bg-background">
            <Outlet />
        </div>
    );
}