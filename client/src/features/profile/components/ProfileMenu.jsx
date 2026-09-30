import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import useAuthStore from "@/features/auth/authStore";
import useThemeStore from "@/features/theme/themeStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";

/**
 * ProfileMenu — top-bar account menu for POS + Kitchen shells.
 *
 * WHY it exists: the admin sidebar owns AvatarDropdown (upward dropdown with
 * theme toggle), but the chromeless POS/kitchen headers need a downward menu
 * with role-appropriate items. Kitchen gets Profile only (no settings surface
 * exists for that role); cashiers get Profile + Settings (terminal scope).
 * Profile opens the shared ProfileModal (self-scoped endpoints, all roles).
 * State: local [open].
 */
export default function ProfileMenu({ user, showSettings = false, onSettingsClick, onOpenProfile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isDark = theme === "dark";

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    const ok = await confirm({
      title: "Sign out?",
      message: "Are you sure you want to sign out?",
      confirmLabel: "Sign out",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await logoutRequest();
    } catch {
      // Logout even if request fails
    } finally {
      logout();
      navigate("/login");
    }
  }

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
        aria-label="Account menu"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary type-caption font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="hidden text-left sm:block">
          <p className="text-xs font-medium leading-tight">{user?.name}</p>
          <p className="type-caption capitalize text-muted-foreground">{user?.role}</p>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-border bg-card py-1 shadow-lg animate-in fade-in-0 duration-150">
          <button
            onClick={() => {
              setOpen(false);
              onOpenProfile?.();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Icon name="user" size={16} />
            Profile
          </button>
          {showSettings && (
            <button
              onClick={() => {
                setOpen(false);
                onSettingsClick?.();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Icon name="settings" size={16} />
              Settings
            </button>
          )}
          <div className="my-1 border-t border-border" />
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
          <div className="my-1 border-t border-border" />
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
          >
            <Icon name="logOut" size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
