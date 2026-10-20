import { useEffect, useState } from "react";
import { orderTiming } from "../orderTiming";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";

/** Browser ticks only refresh the display; persisted status times own the duration. */
export default function OrderElapsedTime({ order, compact = false, badge = false }) {
  const [now, setNow] = useState(Date.now);
  const timing = orderTiming(order, now);
  useEffect(() => {
    if (!timing.running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [timing.running]);

  if (badge) return (
    <Badge variant="outline" className="gap-1" title="Elapsed time from acceptance; stops at completion or cancellation.">
      <Icon name="clock" size={10} />
      {timing.label}: {timing.value}
    </Badge>
  );

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
