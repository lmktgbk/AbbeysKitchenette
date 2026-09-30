import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";
import LiveDot from "@/realtime/LiveDot";
import ProfileMenu from "@/features/profile/components/ProfileMenu";
import ProfileModal from "@/features/profile/components/ProfileModal";
import Icon from "@/components/ui/icon";

export default function KitchenHeader({ refreshing }) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [time, setTime] = useState(new Date());
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
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

  const timeStr = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      {/* Left — brand */}
      <div className="flex items-center gap-2">
        <img src="/favicon.png" alt="Abbey's Kitchenette" className="h-7 w-7 rounded-md ring-1 ring-border" />
        <span className="font-brand text-lg font-semibold">Abbey's Kitchenette</span>
        <div className="ml-2 flex items-center gap-1.5">
          <LiveDot />
          {refreshing && (
            <span className="type-caption font-semibold text-muted-foreground">
              · syncing
            </span>
          )}
        </div>
      </div>

      {/* Center — clock */}
      <div className="tabular-nums text-sm font-semibold text-foreground">
        {timeStr}
      </div>

      {/* Right — controls + profile */}
      <div className="flex items-center gap-1">
        {/* Profile — menu only (kitchen role has no settings surface) */}
        <ProfileMenu
          user={user}
          onOpenProfile={() => setProfileOpen(true)}
        />

        <button
          onClick={handleLogout}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          aria-label="Sign out"
        >
          <Icon name="logOut" size={18} />
        </button>
      </div>
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </header>
  );
}
