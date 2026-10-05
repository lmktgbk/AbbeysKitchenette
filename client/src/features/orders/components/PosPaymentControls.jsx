import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** Hides a failed logo while retaining the payment method’s visible text label. */
function hideBrokenImage(e) {
  e.currentTarget.style.display = "none";
}

/** Renders a controlled discount choice; the parent owns selection and validation. */
export function SegButton({ active, onClick, className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg px-2 text-xs transition-colors",
        active
          ? "bg-primary font-semibold text-primary-foreground shadow-sm"
          : "font-medium text-muted-foreground hover:bg-background hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Selects a manually recorded payment method without starting a gateway transaction. */
export function MethodCard({ active, onClick, method }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative cursor-pointer rounded-lg border px-2 py-2 text-center transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/40 hover:bg-muted/50",
      )}
    >
      {active && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon name="check" size={10} />
        </span>
      )}
      <span className="flex h-6 items-center justify-center">
        {method.logo ? (
          <img src={method.logo} alt={method.label} onError={hideBrokenImage} className="h-5 w-auto object-contain" />
        ) : (
          <Icon name={method.icon} size={18} className="text-muted-foreground" />
        )}
      </span>
      <span className={cn("mt-1 block text-xs", active ? "font-semibold" : "font-medium text-muted-foreground")}>
        {method.label}
      </span>
    </button>
  );
}

