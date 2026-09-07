import { NavLink } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * NavItem — Single navigation item for sidebar.
 * Shows icon + text when expanded, icon-only when collapsed.
 * Active state uses primary color.
 */
export default function NavItem({ icon, label, href, collapsed }) {
    return (
        <NavLink
            to={href}
            className={({ isActive }) =>
                cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
            }
            title={collapsed ? label : undefined}
        >
            <Icon name={icon} size={20} className="shrink-0" />
            {!collapsed && <span className="truncate animate-in fade-in duration-150">{label}</span>}
        </NavLink>
    );
}
