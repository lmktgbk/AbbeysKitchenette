import { cn } from "@/lib/utils";
import { formatVariance } from "@/lib/money";

/**
 * VariancePill — the verdict on a closed drawer session.
 * Exact (green) · Short −₱X (red) · Over +₱X (amber).
 */
export default function VariancePill({ variance, className }) {
  const v = Number(variance ?? 0);
  if (v === 0) {
    return (
      <span className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-[11px] font-bold text-green-600 dark:text-green-400",
        className,
      )}>
        Exact
      </span>
    );
  }
  const short = v < 0;
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums",
      short
        ? "bg-destructive/10 text-destructive"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      className,
    )}>
      {short ? "Short" : "Over"} {formatVariance(v)}
    </span>
  );
}
