import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * ShiftBanner (BR-02)
 *
 * Shows the cashier's open drawer sessions with live expected cash.
 * Full card for the Orders page; compact row for the POS header.
 */
export default function ShiftBanner({ shifts = [], isLoading, onOpenShift, onCloseShift, compact }) {
  if (isLoading) {
    return (
      <div className={cn("animate-pulse rounded-lg bg-muted", compact ? "h-9" : "h-20")} />
    );
  }

  if (shifts.length === 0) {
    return (
      <div className={cn(
        "flex items-center gap-3 rounded-lg border border-dashed border-border bg-card",
        compact ? "px-3 py-1.5" : "px-4 py-3",
      )}>
        <Icon name="wallet" size={compact ? 15 : 18} className="shrink-0 text-muted-foreground" />
        <p className={cn("flex-1 text-muted-foreground", compact ? "text-xs" : "text-sm")}>
          No open shift — open one to take payments.
        </p>
        <Button size="sm" onClick={onOpenShift}>
          Open shift
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", compact && "w-full")}>
      {shifts.map((s) => (
        <div
          key={s.shift_id}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border bg-card",
            compact ? "px-3 py-1.5" : "px-4 py-2.5",
          )}
        >
          <Icon name="wallet" size={compact ? 15 : 18} className="shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>
              {s.opener_name ?? "Cashier"}
              <span className="font-normal text-muted-foreground">
                {" "}· since {s.opened_at ? new Date(s.opened_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
              </span>
            </p>
            {!compact && (
              <p className="text-xs text-muted-foreground">
                Opening ₱{Number(s.opening_cash ?? 0).toLocaleString()}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className={cn("text-[10px] font-medium uppercase tracking-wide text-muted-foreground", compact && "hidden")}>
              Expected
            </p>
            <p className={cn("font-bold tabular-nums", compact ? "text-sm" : "text-base")}>
              ₱{Number(s.expected_cash ?? 0).toLocaleString()}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onCloseShift?.(s)}>
            Close
          </Button>
        </div>
      ))}
    </div>
  );
}
