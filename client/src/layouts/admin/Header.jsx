import { useLocation } from "react-router-dom";
import Icon from "@/components/ui/icon";
import ModeToggle from "@/components/ModeToggle";

/**
 * Route → page title mapping.
 * Add new routes here as modules are built.
 */
const PAGE_TITLES = {
    "/dashboard": "Dashboard",
    "/products": "Products",
    "/inventory": "Inventory",
    "/pos": "POS",
    "/kitchen": "Kitchen",
    "/staff": "Staff",
    "/forecasting": "Forecasting",
    "/market-basket": "Market Basket",
    "/audit-logs": "Audit Logs",
    "/settings": "Settings",
};

/**
 * Header — sticky top bar for admin layout.
 * Left: hamburger toggle + page title.
 * Right: ModeToggle.
 */
export default function Header({ onToggleSidebar }) {
    const location = useLocation();
    const title = PAGE_TITLES[location.pathname] || "Abbey's Kitchenette";

    return (
        <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-card px-4">
            {/* Left — toggle + title */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onToggleSidebar}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Toggle sidebar"
                >
                    <Icon name="menu" size={20} />
                </button>
                <h1 className="text-sm font-semibold text-foreground">
                    {title}
                </h1>
            </div>

            {/* Right — theme toggle + notifications */}
            <div className="ml-auto flex items-center gap-1">
                <ModeToggle />
                <button
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Notifications"
                >
                    <Icon name="bell" size={18} />
                </button>
            </div>
        </header>
    );
}
