import { useState } from "react";
import useAuthStore from "@/features/auth/authStore";
import useLayoutStore from "@/stores/layoutStore";
import NavItem from "./NavItem";
import AvatarDropdown from "./AvatarDropdown";
import ProfileModal from "@/features/profile/components/ProfileModal";

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
            { icon: "receipt", label: "Orders", href: "/orders" },
        ],
    },
    {
        label: "Management",
        items: [
            { icon: "users", label: "Staff", href: "/staff" },
            { icon: "trendingUp", label: "Forecasting", href: "/forecasting" },
            { icon: "shoppingBag", label: "Promotions", href: "/promotions" },
            { icon: "alertTriangle", label: "Anomalies", href: "/anomalies" },
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

export default function Sidebar({ expanded = false }) {
    const collapsed = useLayoutStore((s) => s.collapsed);
    const user = useAuthStore((s) => s.user);
    const [profileOpen, setProfileOpen] = useState(false);
    const isExpanded = expanded || !collapsed;

    return (
        <aside
            className={`flex h-full flex-col border-r bg-card ${
                isExpanded ? "w-64" : "w-16"
            }`}
        >
            <div className="flex h-14 items-center gap-2 border-b px-4">
                <img src="/favicon.png" alt="Abbey's Kitchenette" className="h-6 w-6 shrink-0 rounded" />
                {isExpanded && (
                    <span className="truncate text-sm font-semibold animate-in fade-in duration-150">
                        Abbey's Kitchenette
                    </span>
                )}
            </div>

            <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
                {NAV_GROUPS.map((group) => (
                    <div key={group.label}>
                        {isExpanded && (
                            <p className="mb-1 px-3 text-xs font-medium uppercase text-muted-foreground animate-in fade-in duration-150">
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
                                    collapsed={!isExpanded}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="border-t px-2 py-3">
                <AvatarDropdown
                    collapsed={!isExpanded}
                    user={user}
                    onOpenProfile={() => setProfileOpen(true)}
                />
            </div>

            <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
        </aside>
    );
}
