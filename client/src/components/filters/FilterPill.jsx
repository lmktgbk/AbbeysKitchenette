import { cn } from "@/lib/utils";

/**
 * FilterPill — horizontal pill-style filter toggle.
 *
 * @param {Object} props
 * @param {{ value: string, label: string }[]} props.options - Filter options
 * @param {string} props.value - Currently selected value
 * @param {(value: string) => void} props.onChange - Selection handler
 * @param {string} [props.className] - Additional classes
 */
export function FilterPill({ options, value, onChange, className }) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border overflow-hidden",
        className
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
