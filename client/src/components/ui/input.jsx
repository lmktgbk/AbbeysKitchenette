import { cn } from "@/lib/utils";

export function Input({
    type = "text",
    className,
    error,
    ...props
}) {
    return (
        <div className="w-full">
            <input
                type={type}
                className={cn(
                    "flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus:outline-none focus:border-primary",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "transition-colors",
                    error
                        ? "border-destructive"
                        : "border-input",
                    className
                )}
                {...props}
            />
            {error && (
                <p className="mt-1.5 text-xs text-destructive">{error}</p>
            )}
        </div>
    );
}
