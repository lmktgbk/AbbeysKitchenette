import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";
import { toLocalDate, manilaTodayLocal } from "@/lib/date";
import usePopoverAlign from "./usePopoverAlign";

/**
 * DateRangeFilter — floating date range picker with calendar grid and preset buttons.
 *
 * @param {Object} props
 * @param {string|null} props.dateFrom - "YYYY-MM-DD" or null
 * @param {string|null} props.dateTo - "YYYY-MM-DD" or null
 * @param {(from: string|null, to: string|null) => void} props.onDateChange
 */
export default function DateRangeFilter({ dateFrom, dateTo, onDateChange }) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(dateFrom);
  const [endDate, setEndDate] = useState(dateTo);
  const [viewMonth, setViewMonth] = useState(() => manilaTodayLocal().getMonth());
  const [viewYear, setViewYear] = useState(() => manilaTodayLocal().getFullYear());
  const [hoverDate, setHoverDate] = useState(null);
  // Panel alignment via shared hook: grows away from the nearest edge.
  const ref = useRef(null);
  const panelRef = useRef(null);
  const align = usePopoverAlign(ref, open);
  // Bumps every toggle so a stale position never paints on reopen.
  const [gen, setGen] = useState(0);

  // ── Portal position (fixed, viewport-anchored) ──
  // WHY portal: the trigger often lives inside overflow-hidden cards
  // (e.g. Orders table card) that clip an absolute panel. A body-level
  // fixed panel escapes all ancestor clipping/stacking contexts.
  const PANEL_WIDTH = 288;
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false, gen: 0 });

  function updatePos() {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? 480;
    const margin = 8;
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - height - 4);
    }
    let left = align === "left" ? rect.left : rect.right - PANEL_WIDTH;
    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - PANEL_WIDTH - margin));
    setPos({ top, left, ready: true, gen });
  }

  useEffect(() => {
    if (!open) return;
    updatePos();
    // Second pass after mount: measure the real panel height for the flip.
    const raf = requestAnimationFrame(() => updatePos());
    window.addEventListener("resize", updatePos);
    // Capture phase: reposition on any ancestor scroll while open.
    window.addEventListener("scroll", updatePos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align]);

  const isActive = dateFrom && dateTo;

  const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // ── Helpers ──────────────────────────

  // Emits Manila calendar days (server interprets YYYY-MM-DD as Manila).
  // Grid Dates are device-local midnights; converting the instant keeps the
  // emitted day on the Manila calendar even near midnight. See lib/date.js.
  function toISO(date) {
    return toLocalDate(date);
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
    return toISO(date) === toLocalDate(new Date());
  }

  function formatDateDisplay(str) {
    if (!str) return "";
    const d = parseISO(str);
    const month = MONTH_NAMES[d.getMonth()].slice(0, 3);
    return `${month} ${d.getDate()}`;
  }

  // ── Calendar grid ────────────────────

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    // Monday=0 based: Mon=0, Tue=1, ..., Sun=6
    let startOffset = firstDayOfMonth.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const prevMonthLast = new Date(viewYear, viewMonth, 0).getDate();

    const days = [];

    // Previous month overflow
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLast - i;
      const d = new Date(viewYear, viewMonth - 1, day);
      days.push({ date: d, day, currentMonth: false });
    }

    // Current month
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(viewYear, viewMonth, day);
      days.push({ date: d, day, currentMonth: true });
    }

    // Next month overflow
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(viewYear, viewMonth + 1, day);
      days.push({ date: d, day, currentMonth: false });
    }

    return days;
  }, [viewMonth, viewYear]);

  // ── Selection logic ──────────────────

  function handleDayClick(dateStr) {
    const clicked = parseISO(dateStr);

    if (!startDate || (startDate && endDate)) {
      // Start fresh selection
      setStartDate(dateStr);
      setEndDate(null);
    } else {
      const start = parseISO(startDate);
      if (clicked < start) {
        // Clicked before start → swap
        setEndDate(startDate);
        setStartDate(dateStr);
      } else if (isSameDay(clicked, start)) {
        // Clicked same day → single day
        setEndDate(dateStr);
      } else {
        setEndDate(dateStr);
      }
    }
  }

  function handleDayHover(dateStr) {
    if (startDate && !endDate) {
      setHoverDate(dateStr);
    }
  }

  function isInRange(dateStr) {
    if (!startDate) return false;

    const d = parseISO(dateStr);
    const start = parseISO(startDate);
    const endStr = endDate || hoverDate;
    if (!endStr) return false;
    const end = parseISO(endStr);

    return d >= start && d <= end;
  }

  function isRangeStart(dateStr) {
    return startDate === dateStr;
  }

  function isRangeEnd(dateStr) {
    if (endDate) return endDate === dateStr;
    if (hoverDate) return hoverDate === dateStr;
    return false;
  }

  // ── Preset handlers ──────────────────
  // Each preset resolves to a { start, end } ISO range; go* applies it to the
  // draft, isPresetActive highlights the preset matching the current draft.

  function presetRange(kind) {
    // Manila "now": week/month arithmetic follows the business calendar.
    const now = manilaTodayLocal();
    if (kind === "today") return { start: toISO(now), end: toISO(now) };
    if (kind === "thisWeek") {
      const day = now.getDay();
      const mondayOffset = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { start: toISO(monday), end: toISO(sunday) };
    }
    if (kind === "thisMonth") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: toISO(first), end: toISO(last) };
    }
    if (kind === "lastWeek") {
      const day = now.getDay();
      const mondayOffset = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - mondayOffset);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { start: toISO(lastMonday), end: toISO(lastSunday) };
    }
    if (kind === "lastMonth") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toISO(first), end: toISO(last) };
    }
    return { start: null, end: null };
  }

  function applyRange(start, end, viewDate = manilaTodayLocal()) {
    setStartDate(start);
    setEndDate(end);
    setViewMonth(viewDate.getMonth());
    setViewYear(viewDate.getFullYear());
  }

  function isPresetActive(kind) {
    if (!startDate || !endDate) return false;
    const { start, end } = presetRange(kind);
    return startDate === start && endDate === end;
  }

  function goToday() {
    const { start, end } = presetRange("today");
    applyRange(start, end);
  }

  function goThisWeek() {
    const { start, end } = presetRange("thisWeek");
    applyRange(start, end);
  }

  function goThisMonth() {
    const { start, end } = presetRange("thisMonth");
    applyRange(start, end);
  }

  function goLastWeek() {
    const { start, end } = presetRange("lastWeek");
    const view = start ? parseISO(start) : manilaTodayLocal();
    applyRange(start, end, view);
  }

  function goLastMonth() {
    const { start, end } = presetRange("lastMonth");
    const view = start ? parseISO(start) : manilaTodayLocal();
    applyRange(start, end, view);
  }

  // ── Apply / Clear ────────────────────

  function handleApply() {
    onDateChange(startDate || null, endDate || null);
    setOpen(false);
  }

  function handleClear() {
    setStartDate(null);
    setEndDate(null);
    onDateChange(null, null);
    setOpen(false);
  }

  // ── Month navigation ─────────────────

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

  // ── Click outside + Escape ───────────

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      // Panel lives in a body portal — inside means in either container.
      if (ref.current && !ref.current.contains(e.target)
        && !(panelRef.current && panelRef.current.contains(e.target))) {
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
  }, [open ]);

  // ── Sync local state when props change ──
  // Render-adjust pattern (no set-state-in-effect): keeps the draft
  // selection following the applied range (e.g. after Clear elsewhere).
  const [prevRange, setPrevRange] = useState([dateFrom, dateTo]);
  if (prevRange[0] !== dateFrom || prevRange[1] !== dateTo) {
    setPrevRange([dateFrom, dateTo]);
    setStartDate(dateFrom);
    setEndDate(dateTo);
  }

  // ── Trigger label ────────────────────

  const triggerLabel = isActive
    ? `${formatDateDisplay(dateFrom)} – ${formatDateDisplay(dateTo)}`
    : "All Time";

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setGen((g) => g + 1); setOpen((prev) => !prev); }}
        className={cn(
          "flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-colors",
          isActive
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          open && "border-primary"
        )}
      >
        <Icon name="calendar" size={14} />
        <span className="truncate max-w-[160px]">{triggerLabel}</span>
        <Icon
          name="chevronDown"
          size={12}
          className={cn("transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {/* Panel — body portal so ancestor overflow (table cards) can't clip it.
          Flips above the trigger when space below is short. */}
      {open && pos.gen === gen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 w-72 rounded-lg border border-border bg-card shadow-lg p-3"
          style={{ top: pos.top, left: pos.left, visibility: pos.ready ? "visible" : "hidden" }}
        >
          {/* Presets — highlight follows the draft range (applied on Apply) */}
          <div className="grid grid-cols-3 gap-1 mb-3">
            <PresetButton label="All Time" onClick={handleClear} active={!startDate && !endDate} />
            <PresetButton label="Today" onClick={goToday} active={isPresetActive("today")} />
            <PresetButton label="This Week" onClick={goThisWeek} active={isPresetActive("thisWeek")} />
            <PresetButton label="Last Week" onClick={goLastWeek} active={isPresetActive("lastWeek")} />
            <PresetButton label="This Month" onClick={goThisMonth} active={isPresetActive("thisMonth")} />
            <PresetButton label="Last Month" onClick={goLastMonth} active={isPresetActive("lastMonth")} />
          </div>

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
              {MONTH_NAMES[viewMonth]} {viewYear}
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
              const inRange = isInRange(dateStr);
              const isStart = isRangeStart(dateStr);
              const isEnd = isRangeEnd(dateStr);
              const today = isToday(cell.date);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => cell.currentMonth && handleDayClick(dateStr)}
                  onMouseEnter={() => cell.currentMonth && handleDayHover(dateStr)}
                  disabled={!cell.currentMonth}
                  className={cn(
                    "relative flex items-center justify-center h-8 text-xs transition-colors rounded",
                    !cell.currentMonth && "text-muted-foreground/30 cursor-default",
                    cell.currentMonth && "cursor-pointer",
                    cell.currentMonth && !inRange && !isStart && !isEnd && "hover:bg-muted",
                    cell.currentMonth && inRange && !isStart && !isEnd && "bg-primary/10 text-foreground",
                    isStart && "bg-primary text-primary-foreground font-semibold",
                    isEnd && !isStart && "bg-primary text-primary-foreground font-semibold",
                    today && !isStart && !isEnd && "ring-1 ring-primary/40"
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Selected range display */}
          {(startDate || endDate) && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
              <span>
                Start: <span className="text-foreground font-medium">{formatDateDisplay(startDate) || "—"}</span>
              </span>
              <span>
                End: <span className="text-foreground font-medium">{formatDateDisplay(endDate) || "—"}</span>
              </span>
            </div>
          )}

          {/* Actions */}
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
              onClick={handleApply}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** PresetButton — small pill button for date presets. */
function PresetButton({ label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      {label}
    </button>
  );
}
