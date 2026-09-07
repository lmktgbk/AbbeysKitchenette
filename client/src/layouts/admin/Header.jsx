import { useLocation } from "react-router-dom";
import Icon from "@/components/ui/icon";
import ModeToggle from "@/components/ModeToggle";
import useLayoutStore from "@/stores/layoutStore";

const PAGE_TITLES = {
    "/dashboard": "Dashboard",
    "/products": "Products",
    "/ingredients": "Inventory",
    "/inventory": "Inventory",
    "/orders": "Orders",
    "/pos": "POS",
    "/kitchen": "Kitchen",
    "/staff": "Staff",
    "/forecasting": "Forecasting",
    "/market-basket": "Market Basket",
    "/audit-logs": "Audit Logs",
    "/settings": "Settings",
};

export default function Header() {
    const location = useLocation();
    const isMobile = useLayoutStore((s) => s.isMobile);
    const mobileOpen = useLayoutStore((s) => s.mobileOpen);
    const closeMobile = useLayoutStore((s) => s.closeMobile);
    const setMobileOpen = useLayoutStore((s) => s.setMobileOpen);
    const toggleCollapsed = useLayoutStore((s) => s.toggleCollapsed);
    const title = PAGE_TITLES[location.pathname] || "Abbey's Kitchenette";

    function handleToggle() {
        if (isMobile) {
            if (mobileOpen) {
                closeMobile();
            } else {
                setMobileOpen(true);
            }
        } else {
            toggleCollapsed();
        }
    }

    return (
        <header className="sticky top-0 z-20 flex h-14 items-center border-b bg-card px-4">
            <div className="flex items-center gap-3">
                <button
                    onClick={handleToggle}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Toggle sidebar"
                >
                    <Icon name="menu" size={20} />
                </button>
                <h1 className="text-sm font-semibold text-foreground">
                    {title}
                </h1>
            </div>

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
