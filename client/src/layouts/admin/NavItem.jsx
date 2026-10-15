import { NavLink } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const BADGE_TONES = {
    "/products": "bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    "/inventory": "bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    "/anomalies": "bg-red-100/80 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

/**
 * NavItem — Single navigation item for sidebar.
 * Shows icon + text when expanded, icon-only when collapsed.
 * Active state uses primary color.
 */
export default function NavItem({ icon, label, href, collapsed, count, countLabel }) {
    const hasBadge = Number.isFinite(count) && count > 0;
    const description = hasBadge ? `${label}: ${count} ${countLabel ?? "items"}` : label;
    return (
        <NavLink
            to={href}
            className={({ isActive }) =>
                cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
            }
            title={collapsed || hasBadge ? description : undefined}
            aria-label={description}
        >
            {({ isActive }) => <>
            <Icon name={icon} size={20} className="shrink-0" />
            {!collapsed && <span className="truncate animate-in fade-in duration-150">{label}</span>}
            {hasBadge && <span aria-hidden="true" className={cn(
                "inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums transition-colors",
                isActive ? "bg-white/20 text-primary-foreground" : BADGE_TONES[href] ?? "bg-muted text-muted-foreground",
                collapsed ? "absolute -right-0.5 -top-1 ring-2 ring-card" : "ml-auto",
            )}>{count > 99 ? "99+" : count}</span>}
            </>}
        </NavLink>
    );
}
