import { cn } from "@/lib/utils";
import Icon from "./icon";

/**
 * EmptyState — sanctioned empty placeholder (admin).
 *
 * WHY it exists: empty states ranged from designed (icon + copy + CTA) to
 * bare text ("No data", "No records"). One spelling: icon + title + optional
 * copy + optional action. Centered, py-12 default; pass className to fit
 * fixed-height chart regions (e.g. h-64 py-0).
 */
function EmptyState({ icon = "inbox", title, copy, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}>
      <Icon name={icon} size={28} className="text-muted-foreground/30" />
      <p className="mt-2 font-medium text-foreground/70">{title}</p>
      {copy && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{copy}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export { EmptyState };
