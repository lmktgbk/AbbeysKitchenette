import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";
import usePopoverAlign from "./usePopoverAlign";

/**
 * DatePicker — single-date calendar popover, sibling to DateRangeFilter.
 * Same grid, theme, and dismiss behavior (outside click + Escape).
 *
 * @param {Object} props
 * @param {string|null} props.value - "YYYY-MM-DD" or null
 * @param {(value: string|null) => void} props.onChange
 * @param {string} [props.placeholder] - muted text when empty
 */

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISO(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(str) {
  if (!str) return "";
  const d = parseISO(str);
  return `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function DatePicker({ value, onChange, placeholder = "Select date" }) {
  const [open, setOpen] = useState(false);
  const initial = value ? parseISO(value) : new Date();
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const ref = useRef(null);
  const align = usePopoverAlign(ref, open);
  const [prevValue, setPrevValue] = useState(value);

  // Re-anchor the calendar when a new value arrives while closed
  // (render-adjust pattern — no set-state-in-effect).
  if (!open && prevValue !== value) {
    setPrevValue(value);
    if (value) {
      const d = parseISO(value);
      setViewMonth(d.getMonth());
      setViewYear(d.getFullYear());
    }
  }

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    let startOffset = firstDayOfMonth.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const prevMonthLast = new Date(viewYear, viewMonth, 0).getDate();
    const days = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLast - i;
      days.push({ date: new Date(viewYear, viewMonth - 1, day), day, currentMonth: false });
    }
    for (let day = 1; day <= totalDays; day++) {
      days.push({ date: new Date(viewYear, viewMonth, day), day, currentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      days.push({ date: new Date(viewYear, viewMonth + 1, day), day, currentMonth: false });
    }
    return days;
  }, [viewMonth, viewYear]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleDayClick(dateStr) {
    onChange?.(dateStr);
    setOpen(false);
  }

  function handleClear() {
    onChange?.(null);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open ]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm transition-colors",
          "focus:outline-none focus:border-primary hover:border-muted-foreground/50",
          open && "border-primary",
          !value && "text-muted-foreground",
        )}
      >
        <Icon name="calendar" size={14} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-left">
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date"
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleClear(); }}
            className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon name="x" size={13} />
          </span>
        ) : (
          <Icon name="chevronDown" size={13} className={cn("shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
        )}
      </button>

      {open && (
        <div className={cn(
          "absolute z-50 mt-1 w-72 rounded-lg border border-border bg-card shadow-lg p-3",
          align === "left" ? "left-0" : "right-0",
        )}>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Previous month"
            >
              <Icon name="chevronLeft" size={14} />
            </button>
            <span className="text-sm font-medium text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Next month"
            >
              <Icon name="chevronRight" size={14} />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((label) => (
              <div key={label} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((cell, i) => {
              const dateStr = toISO(cell.date);
              const selected = value === dateStr;
              const today = toISO(new Date()) === dateStr;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => cell.currentMonth && handleDayClick(dateStr)}
                  disabled={!cell.currentMonth}
                  className={cn(
                    "relative flex items-center justify-center h-8 text-xs transition-colors rounded",
                    !cell.currentMonth && "text-muted-foreground/30 cursor-default",
                    cell.currentMonth && "cursor-pointer",
                    cell.currentMonth && !selected && "hover:bg-muted",
                    selected && "bg-primary text-primary-foreground font-semibold",
                    today && !selected && "ring-1 ring-primary/40",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
