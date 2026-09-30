/**
 * LiveDot — connection-status indicator for the realtime socket.
 * Green LIVE when the socket is up, amber RECONNECTING while retrying,
 * hidden entirely when realtime is disabled (VITE_REALTIME=off).
 * Presentational only: never blocks or queues anything.
 */
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useRealtimeStatus, startRealtime } from "./socket";

export default function LiveDot({ className }) {
  const status = useRealtimeStatus();

  useEffect(() => {
    startRealtime();
  }, []);

  if (status === "disabled") return null;
  const live = status === "live";
  return (
    <span
      title={live ? "Live updates connected" : "Reconnecting live updates…"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 type-caption font-medium",
        live
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {!live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            live ? "bg-emerald-500" : "bg-amber-500",
          )}
        />
      </span>
      {live ? "Live" : "Syncing"}
    </span>
  );
}
