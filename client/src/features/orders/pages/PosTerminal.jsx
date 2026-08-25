import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { FilterPill } from "@/components/filters/FilterPill";
import ModeToggle from "@/components/ModeToggle";
import Icon from "@/components/ui/icon";

const VIEW_OPTIONS = [
  { value: "pos", label: "POS" },
  { value: "orders", label: "Orders" },
];

/**
 * PosTerminal — full-screen terminal layout for cashiers.
 *
 * Shared header with:
 * - SmartCafe brand
 * - FilterPill to toggle POS / Orders views
 * - Dark/light mode toggle
 * - User profile (name + role)
 * - Sign out button
 *
 * Child routes render via <Outlet />:
 * - /pos          → PosInterface (product menu + order summary)
 * - /pos/orders   → OrdersPage (embedded, no sidebar)
 */
export default function PosTerminal() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const activeView = location.pathname.startsWith("/pos/orders") ? "orders" : "pos";

  function handleViewChange(value) {
    if (value === "orders") {
      navigate("/pos/orders");
    } else {
      navigate("/pos");
    }
  }

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
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        {/* Left — brand */}
        <div className="flex items-center gap-2">
          <Icon name="coffee" size={20} className="text-primary" />
          <span className="font-serif text-lg font-semibold">SmartCafe</span>
        </div>

        {/* Center — view toggle */}
        <FilterPill
          options={VIEW_OPTIONS}
          value={activeView}
          onChange={handleViewChange}
        />

        {/* Right — theme, profile, sign out */}
        <div className="flex items-center gap-2">
          <ModeToggle />

          {/* Profile */}
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {initials}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-medium leading-tight">{user?.name}</p>
              <p className="text-[10px] capitalize text-muted-foreground">{user?.role}</p>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            aria-label="Sign out"
          >
            <Icon name="logOut" size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <Outlet />
    </div>
  );
}
