import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "@/features/auth/authStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";
import ModeToggle from "@/components/ModeToggle";
import Icon from "@/components/ui/icon";

export default function KitchenHeader({ counts, refreshing }) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [time, setTime] = useState(new Date());

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
        <Icon name="coffee" size={20} className="text-primary" />
        <span className="font-serif text-lg font-semibold">Abbey's Kitchenette</span>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg ml-2 bg-primary/5 border border-primary/10">
          <div className="w-1.5 h-1.5 rounded-full kds-pulse-dot bg-primary" />
          <span className="text-[10px] font-semibold text-primary">
            Live{refreshing ? " · syncing" : ""}
          </span>
        </div>
      </div>

      {/* Right — counters + clock + controls */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="text-center px-3 py-1.5 rounded-lg bg-background border border-border">
            <div className="text-[8px] uppercase tracking-widest font-semibold text-muted-foreground">
              Preparing
            </div>
            <div className="font-serif text-base font-bold text-foreground">
              {counts.processing}
            </div>
          </div>
          <div className="text-center px-3 py-1.5 rounded-lg bg-background border border-border">
            <div className="text-[8px] uppercase tracking-widest font-semibold text-muted-foreground">
              In Queue
            </div>
            <div className="font-serif text-base font-bold text-foreground">
              {counts.queue}
            </div>
          </div>
        </div>
        <div className="tabular-nums text-sm font-semibold text-foreground">{timeStr}</div>
        <ModeToggle />
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
