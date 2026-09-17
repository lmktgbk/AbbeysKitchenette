import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Tooltip — lightweight hover tooltip.
 * Pure CSS + minimal JS, no additional deps needed.
 */
export function Tooltip({ children, content, side = "bottom", className }) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  const show = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(true), 200);
  };
  const hide = () => {
    clearTimeout(timerRef.current);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const positionClasses = {
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 w-56 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md",
            "opacity-100 transition-opacity duration-150",
            positionClasses[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
