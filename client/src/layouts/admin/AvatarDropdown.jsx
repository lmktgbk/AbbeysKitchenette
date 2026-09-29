import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import useAuthStore from "@/features/auth/authStore";
import useThemeStore from "@/features/theme/themeStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";

/** AvatarDropdown — sidebar account menu. WHY it exists: keeps profile/settings/logout + outside-click close in one spot so Sidebar stays lean; consumed by Sidebar. State: local [open]. */
export default function AvatarDropdown({ collapsed, user, onOpenProfile }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const navigate = useNavigate();
    const logout = useAuthStore((s) => s.logout);
    const theme = useThemeStore((s) => s.theme);
    const toggleTheme = useThemeStore((s) => s.toggleTheme);
    const isDark = theme === "dark";

    // Close on outside click
    useEffect(() => {
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // logout
    async function handleLogout() {
        const confirmLogout = await confirm({
            title: "Logout?",
            message: "Are you sure you want to logout?",
            confirmLabel: "Logout",
            variant: "danger",
        });
        if (!confirmLogout) return;

        try {
            await logoutRequest()
        } catch {
            // Logout even if request fails
        } finally {
            logout();
            navigate("/login");
        }
    }

    const initials = user?.name
        ? user.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)
        : "??";

    return (
        <div className="relative" ref={ref}>
            <div className="flex items-center gap-2">
                {/* Account area — click to open dropdown */}
                <button
                    onClick={() => setOpen(!open)}
                    className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                    {user?.imageUrl ? (
                        <img
                            src={user.imageUrl}
                            alt={user.name}
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                    ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                            {initials}
                        </div>
                    )}
                    {!collapsed && (
                        <span className="truncate text-sm font-medium text-foreground animate-in fade-in duration-150">
                            {user?.name}
                        </span>
                    )}
                </button>

                {/* Logout button — always visible */}
                {!collapsed && (
                    <button
                        onClick={handleLogout}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive animate-in fade-in duration-150"
                        aria-label="Logout"
                    >
                        <Icon name="logOut" size={18} />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute bottom-full mb-2 left-0 w-56 rounded-lg border bg-card py-1 z-30 shadow-lg">
                    <DropdownItem
                        icon="user"
                        label="Profile"
                        onClick={() => {
                            setOpen(false);
                            onOpenProfile();
                        }}
                    />
                    <DropdownItem
                        icon="settings"
                        label="Settings"
                        onClick={() => {
                            setOpen(false);
                            navigate("/settings");
                        }}
                    />
                    <div className="my-1 border-t" />
                    <button
                        onClick={toggleTheme}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                        aria-label="Toggle theme"
                    >
                        <Icon name={isDark ? "sun" : "moon"} size={16} />
                        <span className="flex-1 text-left">{isDark ? "Light mode" : "Dark mode"}</span>
                        <span
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isDark ? "bg-primary" : "bg-muted"}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 rounded-full bg-card shadow transition-transform ${isDark ? "translate-x-4" : "translate-x-0.5"}`}
                            />
                        </span>
                    </button>
                    <div className="my-1 border-t" />
                    <DropdownItem
                        icon="logOut"
                        label="Logout"
                        onClick={handleLogout}
                        danger
                    />
                </div>
            )}
        </div>
    );
}

function DropdownItem({ icon, label, onClick, danger }) {
    return (
        <button
            onClick={onClick}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted ${danger
                ? "text-destructive"
                : "text-foreground"
                }`}
        >
            <Icon name={icon} size={16} />
            {label}
        </button>
    );
}
