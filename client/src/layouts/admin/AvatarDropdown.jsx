import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import useAuthStore from "@/features/auth/authStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";

/**
 * AvatarDropdown — user section at bottom of sidebar.
 * Shows: [Initials] Name    [Logout icon]
 * Clicking the account area opens dropdown (Profile, Settings, Logout).
 * Logout icon is always visible for quick access.
 */
export default function AvatarDropdown({ collapsed, user }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const navigate = useNavigate();
    const logout = useAuthStore((s) => s.logout);

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
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {initials}
                    </div>
                    {!collapsed && (
                        <span className="truncate text-sm font-medium text-foreground">
                            {user?.name}
                        </span>
                    )}
                </button>

                {/* Logout button — always visible */}
                {!collapsed && (
                    <button
                        onClick={handleLogout}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        aria-label="Logout"
                    >
                        <Icon name="logOut" size={18} />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute bottom-full mb-2 w-48 rounded-lg border bg-card py-1 shadow-md left-0">
                    <DropdownItem
                        icon="user"
                        label="Profile"
                        onClick={() => {
                            setOpen(false);
                            navigate("/settings/profile");
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
