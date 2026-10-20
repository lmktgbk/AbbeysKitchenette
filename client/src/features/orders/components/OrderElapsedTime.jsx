import { useEffect, useState } from "react";
import { orderTiming } from "../orderTiming";
import { cn } from "@/lib/utils";

/** Browser ticks only refresh the display; persisted status times own the duration. */
export default function OrderElapsedTime({ order, compact = false }) {
  const [now, setNow] = useState(Date.now);
  const timing = orderTiming(order, now);
  useEffect(() => {
    if (!timing.running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timing.running]);

  return (
    <span
      title="Elapsed time from acceptance; stops at completion or cancellation."
      className={cn(
        compact ? "type-micro font-semibold" : "inline-flex flex-wrap gap-x-2 rounded-md bg-muted px-3 py-2 text-sm",
        compact && timing.running && timing.elapsed > 10 * 60000
          ? "kds-timer-pulse text-destructive"
          : "text-muted-foreground",
      )}
    >
      <span>{timing.label}: </span>
      <span className={cn(!compact && "font-semibold text-foreground")}>{timing.value}</span>
    </span>
  );
}
