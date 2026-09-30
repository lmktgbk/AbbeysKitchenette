import { cn } from "@/lib/utils";
import Icon from "./icon";

/**
 * Stat — shared KPI typography + card shell (admin).
 *
 * WHY it exists: KPI strips in dashboard/analytics/orders/shifts/transactions
 * each hand-rolled label/value/sub classes (text-lg→text-3xl values,
 * text-[10px] vs text-xs labels). These pieces compose into any card layout
 * with one sanctioned treatment. Numbers inherit global tabular figures
 * from body; no per-value tabular-nums needed.
 *
 * Roles:
 * - StatCard  — full icon-right KPI card (DashboardKpis, AnalyticsKpis shape)
 * - StatLabel — caption label (type-caption, uppercase, muted)
 * - StatValue — value (text-lg bold; size="hero" → text-2xl for Waste/Fulfillment)
 * - StatSub   — sub-line (type-small, muted)
 */

/** Full icon-right KPI card. `extra` renders beside the sub-line (e.g. TrendArrow + dot). */
function StatCard({ icon, iconBg, iconColor, label, value, sub, extra, className }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-4 py-3", className)}>
      <div className="mb-2 flex items-center justify-between">
        <StatLabel>{label}</StatLabel>
        {icon && (
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", iconBg)}>
            <Icon name={icon} size={14} className={iconColor} />
          </div>
        )}
      </div>
      <StatValue>{value}</StatValue>
      {(sub || extra) && (
        <div className="flex items-center gap-1.5">
          {sub && <StatSub>{sub}</StatSub>}
          {extra}
        </div>
      )}
    </div>
  );
}

function StatLabel({ className, ...props }) {
  return (
    <span
      className={cn(
        "type-caption block truncate font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function StatValue({ size = "md", className, ...props }) {
  return (
    <span
      className={cn(
        "block truncate font-bold whitespace-nowrap text-foreground",
        size === "hero" ? "text-2xl" : "text-lg",
        className,
      )}
      {...props}
    />
  );
}

function StatSub({ className, ...props }) {
  return (
    <span
      className={cn("type-small truncate text-muted-foreground", className)}
      {...props}
    />
  );
}

export { StatCard, StatLabel, StatValue, StatSub };
