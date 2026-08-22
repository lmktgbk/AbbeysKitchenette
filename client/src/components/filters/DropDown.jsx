import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";

/**
 * DropDown — custom select that replaces native <select>.
 * Fully themed, opens on click, pick one option, closes.
 *
 * @param {Object} props
 * @param {{ value: string, label: string }[]} props.options
 * @param {string} [props.value] - Currently selected value
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.placeholder] - Placeholder when nothing selected
 * @param {boolean} [props.disabled]
 * @param {'default' | 'sm'} [props.size]
 * @param {string} [props.className]
 */
export function DropDown({
    options,
    value,
    onChange,
    placeholder = "Select...",
    disabled = false,
    size = "default",
    className,
}) {
    const [open, setOpen] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const ref = useRef(null);

    const selected = options.find((opt) => opt.value === value);

    const triggerSize = size === "sm"
        ? "h-8 px-2 text-xs"
        : "h-10 px-3 text-sm";

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        function handleKey(e) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [open]);

    function handleSelect(opt) {
        onChange(opt.value);
        setOpen(false);
    }

    return (
        <div ref={ref} className={cn("relative", className)}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => {
                    if (disabled) return;
                    if (!open && ref.current) {
                        const rect = ref.current.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        setOpenUp(spaceBelow < 220);
                    }
                    setOpen((prev) => !prev);
                }}
                disabled={disabled}
                className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-transparent transition-colors",
                    triggerSize,
                    "focus:outline-none focus:border-primary",
                    disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:border-muted-foreground/50",
                    open && "border-primary"
                )}
            >
                <span className={cn("truncate", !selected && "text-muted-foreground")}>
                    {selected ? selected.label : placeholder}
                </span>
                <Icon
                    name="chevronDown"
                    size={14}
                    className={cn(
                        "shrink-0 text-muted-foreground transition-transform duration-200",
                        open && "rotate-180"
                    )}
                />
            </button>

            {/* Dropdown panel */}
            {open && (
                <div className={cn(
                    "absolute z-50 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg",
                    openUp ? "bottom-full mb-1" : "mt-1"
                )}>
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleSelect(opt)}
                            className={cn(
                                "flex w-full items-center px-3 py-2 text-sm transition-colors",
                                opt.value === value
                                    ? "bg-muted font-medium text-foreground"
                                    : "text-foreground hover:bg-muted"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
