import { cn } from "@/lib/utils";

const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ghost: "hover:bg-muted text-foreground",
    link: "text-primary underline-offset-4 hover:underline",
    outline: "border border-border bg-transparent hover:bg-muted text-foreground",
};

const sizes = {
    default: "h-10 px-4 py-2 text-sm",
    sm: "h-8 px-3 text-xs",
    lg: "h-12 px-6 text-base",
    icon: "h-10 w-10",
};

export function Button({
    variant = "primary",
    size = "default",
    fullWidth = false,
    className,
    children,
    disabled,
    type = "button",
    ...props
}) {
    return (
        <button
            type={type}
            disabled={disabled}
            className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors whitespace-nowrap select-none outline-none",
                "focus-visible:border-primary",
                "disabled:pointer-events-none disabled:opacity-50",
                variants[variant],
                sizes[size],
                fullWidth && "w-full",
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
}
