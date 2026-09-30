/**
 * PosTerminal — full-screen terminal shell (header + Outlet for /pos, /pos/orders, /pos/kitchen).
 * WHY it exists: gives cashiers/kitchen a chromeless workspace separate from the admin
 * sidebar; owns view-switch, receipt auto-print toggle, and logout. Query keys consumed:
 * none (no useQuery; receipts use localStorage via shouldAutoPrint). Guards: router-level
 * staff roles; no BR-02 shift gate here (lives in OrdersPage/POS).
 * State: Query [] | local [autoPrint] | Zustand [user, logout via useAuthStore].
 */
import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { FilterPill } from "@/components/filters/FilterPill";
import LiveDot from "@/realtime/LiveDot";
import Icon from "@/components/ui/icon";
import ProfileMenu from "@/features/profile/components/ProfileMenu";
import ProfileModal from "@/features/profile/components/ProfileModal";
import TerminalSettingsModal from "@/features/settings/components/TerminalSettingsModal";
import ReceiptPrintHost from "@/features/receipts/ReceiptPrintHost";

const VIEW_OPTIONS = [
  { value: "pos", label: "POS" },
  { value: "orders", label: "Orders" },
  { value: "kitchen", label: "Kitchen" },
];

export default function PosTerminal() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [profileOpen, setProfileOpen] = useState(false);
  const [terminalSettingsOpen, setTerminalSettingsOpen] = useState(false);

  const activeView = location.pathname.startsWith("/pos/orders")
    ? "orders"
    : location.pathname.startsWith("/pos/kitchen")
      ? "kitchen"
      : "pos";

  function handleViewChange(value) {
    if (value === "orders") {
      navigate("/pos/orders");
    } else if (value === "kitchen") {
      navigate("/pos/kitchen");
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

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        {/* Left — brand */}
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="Abbey's Kitchenette" className="h-7 w-7 rounded-md ring-1 ring-border" />
          <span className="font-brand text-lg font-semibold">Abbey's Kitchenette</span>
        </div>

        {/* Center — view toggle */}
        <FilterPill
          options={VIEW_OPTIONS}
          value={activeView}
          onChange={handleViewChange}
        />

        {/* Right — printer, theme, profile, sign out */}
        <div className="flex items-center gap-2">
          <LiveDot />
          <button
            onClick={() => setTerminalSettingsOpen(true)}
            title="Terminal settings"
            aria-label="Terminal settings"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon name="settings" size={18} />
          </button>
          {/* Profile */}

          <ProfileMenu
            user={user}
            showSettings
            onSettingsClick={() => setTerminalSettingsOpen(true)}
            onOpenProfile={() => setProfileOpen(true)}
          />

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
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
      <TerminalSettingsModal open={terminalSettingsOpen} onOpenChange={setTerminalSettingsOpen} />
      <ReceiptPrintHost />
    </div>
  );
}
