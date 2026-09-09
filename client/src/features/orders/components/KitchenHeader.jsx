import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";
import ModeToggle from "@/components/ModeToggle";
import Icon from "@/components/ui/icon";

export default function KitchenHeader({ refreshing }) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

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
        <Icon name="coffee" size={20} className="text-primary" />
        <span className="font-serif text-lg font-semibold">Abbey's Kitchenette</span>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg ml-2 bg-primary/5 border border-primary/10">
          <div className="w-1.5 h-1.5 rounded-full kds-pulse-dot bg-primary" />
          <span className="text-[10px] font-semibold text-primary">
            Live{refreshing ? " · syncing" : ""}
          </span>
        </div>
      </div>

      {/* Center — clock */}
      <div className="tabular-nums text-sm font-semibold text-foreground">
        {timeStr}
      </div>

      {/* Right — controls + profile */}
      <div className="flex items-center gap-1">
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

        <button
          onClick={handleLogout}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          aria-label="Sign out"
        >
          <Icon name="logOut" size={18} />
        </button>
      </div>
    </header>
  );
}
