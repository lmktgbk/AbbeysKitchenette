import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * SingleDatePicker — floating calendar for picking a single date.
 *
 * @param {Object} props
 * @param {string|null} props.value - "YYYY-MM-DD" or null (all dates)
 * @param {(value: string|null) => void} props.onChange - null = clear to "All dates"
 * @param {string[]} [props.disabledDates] - ISO dates to grey out
 * @param {string} [props.className]
 */
export default function SingleDatePicker({ value, onChange, disabledDates = [], className }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return { month: m - 1, year: y };
    }
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  });
  const ref = useRef(null);

  const disabledSet = useMemo(() => new Set(disabledDates), [disabledDates]);

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      setViewMonth({ month: m - 1, year: y });
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
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
  }, [open]);

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

  function isSameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function isToday(date) {
    return isSameDay(date, new Date());
  }

  function formatDisplay(str) {
    if (!str) return "All dates";
    const d = parseISO(str);
    const month = MONTH_NAMES[d.getMonth()].slice(0, 3);
    return `${month} ${d.getDate()}`;
  }

  const calendarDays = useMemo(() => {
    const { month, year } = viewMonth;
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    let startOffset = firstDayOfMonth.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const prevMonthLast = new Date(year, month, 0).getDate();
    const days = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLast - i;
      const d = new Date(year, month - 1, day);
      days.push({ date: d, day, currentMonth: false });
    }

    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      days.push({ date: d, day, currentMonth: true });
    }

    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day);
      days.push({ date: d, day, currentMonth: false });
    }

    return days;
  }, [viewMonth]);

  function handleDayClick(dateStr) {
    if (value === dateStr) {
      onChange(null);
    } else {
      onChange(dateStr);
    }
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth.month === 0) {
      setViewMonth({ month: 11, year: viewMonth.year - 1 });
    } else {
      setViewMonth({ month: viewMonth.month - 1, year: viewMonth.year });
    }
  }

  function nextMonth() {
    if (viewMonth.month === 11) {
      setViewMonth({ month: 0, year: viewMonth.year + 1 });
    } else {
      setViewMonth({ month: viewMonth.month + 1, year: viewMonth.year });
    }
  }

  const isActive = !!value;

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-colors",
          isActive
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          open && "border-primary"
        )}
      >
        <Icon name="calendar" size={14} />
        <span className="truncate max-w-[120px]">{formatDisplay(value)}</span>
        <Icon
          name="chevronDown"
          size={12}
          className={cn("transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-72 rounded-lg border border-border bg-card shadow-lg p-3">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="chevronLeft" size={14} />
            </button>
            <span className="text-sm font-medium text-foreground">
              {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="chevronRight" size={14} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-[10px] font-semibold text-muted-foreground py-1"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((cell, i) => {
              const dateStr = toISO(cell.date);
              const isSelected = value === dateStr;
              const today = isToday(cell.date);
              const isDisabled = disabledSet.has(dateStr);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => cell.currentMonth && !isDisabled && handleDayClick(dateStr)}
                  disabled={!cell.currentMonth || isDisabled}
                  className={cn(
                    "relative flex items-center justify-center h-8 text-xs transition-colors rounded",
                    !cell.currentMonth && "text-muted-foreground/30 cursor-default",
                    cell.currentMonth && !isDisabled && "cursor-pointer",
                    cell.currentMonth && !isDisabled && !isSelected && "hover:bg-muted",
                    isDisabled && cell.currentMonth && "text-muted-foreground/30 cursor-not-allowed line-through",
                    isSelected && "bg-primary text-primary-foreground font-semibold",
                    today && !isSelected && "ring-1 ring-primary/40"
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              All dates
            </button>
            <button
              type="button"
              onClick={() => {
                const today = toISO(new Date());
                onChange(today);
                setOpen(false);
              }}
              className="px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-md transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
