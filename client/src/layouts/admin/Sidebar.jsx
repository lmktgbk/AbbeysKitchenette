import Icon from "@/components/ui/icon";
import useAuthStore from "@/features/auth/authStore";
import NavItem from "./NavItem";
import AvatarDropdown from "./AvatarDropdown";

/**
 * Nav structure — grouped by category.
 * Add new modules here as they're built.
 */
const NAV_GROUPS = [
    {
        label: "Main",
        items: [{ icon: "dashboard", label: "Dashboard", href: "/dashboard" }],
    },
    {
        label: "Operations",
        items: [
            { icon: "package", label: "Products", href: "/products" },
            { icon: "warehouse", label: "Inventory", href: "/inventory" },
            { icon: "cart", label: "POS", href: "/pos" },
            { icon: "chefHat", label: "Kitchen", href: "/kitchen" },
        ],
    },
    {
        label: "Management",
        items: [
            { icon: "users", label: "Staff", href: "/staff" },
            { icon: "trendingUp", label: "Forecasting", href: "/forecasting" },
            { icon: "shoppingBag", label: "Market Basket", href: "/market-basket" },
        ],
    },
    {
        label: "System",
        items: [
            { icon: "fileText", label: "Audit Logs", href: "/audit-logs" },
            { icon: "settings", label: "Settings", href: "/settings" },
        ],
    },
];

/**
 * Sidebar — collapsible navigation panel.
 * Expanded: 260px with icon + text. Collapsed: 64px with icon only.
 * Contains logo at top, nav groups in middle, user section at bottom.
 */
export default function Sidebar({ collapsed }) {
    const user = useAuthStore((s) => s.user);

    return (
        <aside
            className={`flex h-full flex-col border-r bg-card transition-all duration-200 ${collapsed ? "w-16" : "w-64"
                }`}
        >
            {/* Logo */}
            <div className="flex h-14 items-center gap-2 border-b px-4">
                <Icon name="chefHat" size={24} className="shrink-0 text-primary" />
                {!collapsed && (
                    <span className="truncate text-sm font-semibold">
                        Abbey's Kitchenette
                    </span>
                )}
            </div>

            {/* Nav Groups */}
            <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
                {NAV_GROUPS.map((group) => (
                    <div key={group.label}>
                        {!collapsed && (
                            <p className="mb-1 px-3 text-xs font-medium uppercase text-muted-foreground">
                                {group.label}
                            </p>
                        )}
                        <div className="space-y-1">
                            {group.items.map((item) => (
                                <NavItem
                                    key={item.href}
                                    icon={item.icon}
                                    label={item.label}
                                    href={item.href}
                                    collapsed={collapsed}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            {/* User Section */}
            <div className="border-t px-2 py-3">
                <AvatarDropdown collapsed={collapsed} user={user} />
            </div>
        </aside>
    );
}
