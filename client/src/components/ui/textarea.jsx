import { cn } from "@/lib/utils";

/**
 * Textarea Component
 *
 * Multi-line text input with error state support.
 * Same styling pattern as Input — flat design, focus:border-primary.
 */

function Textarea({ className, error, ...props }) {
  return (
    <div className="w-full">
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
          error ? "border-destructive" : "border-input",
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { Textarea };
