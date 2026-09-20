import { cn } from "@/lib/utils";

/**
 * ExpiryBadge (BR-05)
 *
 * Pill showing days-until-expiry using the alert-dot language:
 * green (> 7d) → amber (≤ 7d) → red (expired). No date = muted dash.
 * Title always carries the full date for precision.
 */
export default function ExpiryBadge({ expiryDate, days, className }) {
  if (expiryDate == null || days == null) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  const tone =
    days < 0
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : days <= 7
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "bg-green-500/10 text-green-600 dark:text-green-400";

  const label = days < 0 ? "Expired" : days === 0 ? "Today" : `${days}d`;

  return (
    <span
      title={`Expires ${expiryDate}`}
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
