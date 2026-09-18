import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/money";
import VariancePill from "./VariancePill";
import { initials, humanDay, timeHM, formatDuration } from "../shiftUtils";

/**
 * ShiftCard (BR-02)
 *
 * One drawer session: avatar + human date + duration, Expected /
 * Counted mini-stats, verdict pill. Open cards pulse LIVE and carry
 * their Close action. Click opens the detail drawer.
 */
export default function ShiftCard({ shift, onOpen, onClose, canClose }) {
  const isOpen = shift.status === "open";
  const expected = shift.expected_cash != null ? Number(shift.expected_cash) : null;
  const actual = shift.actual_cash != null ? Number(shift.actual_cash) : null;
  const duration = formatDuration(shift.opened_at, shift.closed_at);
  const day = humanDay(shift.opened_at);
  const range = isOpen
    ? `Since ${timeHM(shift.opened_at)}`
    : `${timeHM(shift.opened_at)}–${timeHM(shift.closed_at)}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(shift)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(shift); }}
      className={cn(
        "w-full cursor-pointer rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/40",
        isOpen && "border-l-4 border-l-green-500",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {initials(shift.opener_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{shift.opener_name ?? "Cashier"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {day} · {range}{duration && <> · {duration}</>}
          </p>
        </div>
        {isOpen ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-[11px] font-bold text-green-600 dark:text-green-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            LIVE
          </span>
        ) : (
          <VariancePill variance={shift.variance} />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 divide-x divide-border rounded-lg bg-muted/50 py-2 text-center">
        <div className="px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Expected</p>
          <p className="text-sm font-bold tabular-nums">{expected != null ? formatPeso(expected) : "—"}</p>
        </div>
        <div className="px-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Counted</p>
          <p className="text-sm font-bold tabular-nums">{actual != null ? formatPeso(actual) : "—"}</p>
        </div>
      </div>

      {isOpen && canClose && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full font-semibold"
          onClick={(e) => { e.stopPropagation(); onClose?.(shift); }}
        >
          Close shift
        </Button>
      )}
      {isOpen && !canClose && (
        <div className="mt-3 flex justify-end">
          <Badge variant="success">Drawer open</Badge>
        </div>
      )}
    </div>
  );
}
