import { useResettableState } from "@/hooks/useResettableState";
import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";
import usePopoverAlign from "./usePopoverAlign";

/**
 * TimePicker — time-of-day popover, sibling to DatePicker.
 * Same trigger style, portal behavior, and dismiss pattern.
 *
 * @param {Object} props
 * @param {string|null} props.value - "HH:mm" (24-hour) or null
 * @param {(value: string|null) => void} props.onChange
 * @param {number} [props.minuteStep=15] - Minute spacing; automation uses 1.
 * @param {boolean} [props.allowClear=true] - Hide clearing for required times.
 * @param {string} [props.placeholder] - muted text when empty
 */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

function formatDisplay(value) {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

function parseValue(value) {
  if (!value) return { hour: "08", minute: "00" };
  const [h, m] = value.split(":");
  return { hour: h ?? "08", minute: m ?? "00" };
}

export default function TimePicker({ value, onChange, placeholder = "Select time", minuteStep = 15, allowClear = true, "aria-label": ariaLabel }) {
  const [open, setOpen] = useState(false);
  // Exact schedules use step 1; other consumers keep quarter-hour choices.
  const minutes = useMemo(() => {
    const step = Number.isInteger(minuteStep) && minuteStep >= 1 && minuteStep <= 60 ? minuteStep : 15;
    return Array.from({ length: Math.ceil(60 / step) }, (_, i) => String(i * step).padStart(2, "0"));
  }, [minuteStep]);
  // Resolve the portal boundary when opening, rather than reading a DOM ref during render.
  const [portalTarget, setPortalTarget] = useState(null);
  const { hour: initH, minute: initM } = parseValue(value);
  const [selectedHour, setSelectedHour] = useResettableState(initH, [value, open]);
  const [selectedMinute, setSelectedMinute] = useResettableState(initM, [value, open]);
  const [gen, setGen] = useState(0);

  const ref = useRef(null);
  const panelRef = useRef(null);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  const align = usePopoverAlign(ref, open);

  const PANEL_WIDTH = 240;
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false, gen: 0 });

  function updatePos() {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? 300;
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
    const raf = requestAnimationFrame(() => updatePos());
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align]);

  // Scroll selected items into view when panel opens
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const hEl = hourRef.current?.querySelector("[data-selected]");
      const mEl = minuteRef.current?.querySelector("[data-selected]");
      hEl?.scrollIntoView({ block: "center" });
      mEl?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);


  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (
        ref.current && !ref.current.contains(e.target) &&
        !(panelRef.current && panelRef.current.contains(e.target))
      ) setOpen(false);
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

  function handleApply() {
    onChange?.(`${selectedHour}:${selectedMinute}`);
    setOpen(false);
  }

  function handleClear() {
    onChange?.(null);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        aria-label={ariaLabel}
        type="button"
        onClick={(event) => {
          setPortalTarget(event.currentTarget.closest('[role="dialog"]'));
          setGen((g) => g + 1);
          setOpen((prev) => !prev);
        }}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm transition-colors",
          "focus:outline-none focus:border-primary hover:border-muted-foreground/50",
          open && "border-primary",
          !value && "text-muted-foreground",
        )}
      >
        <Icon name="clock" size={14} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-center">
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && allowClear ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear time"
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

      {/* Panel — portal outside the trigger card, within its enclosing modal when present */}
      {open && pos.gen === gen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 rounded-lg border border-border bg-card shadow-lg p-3"
          style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH, visibility: pos.ready ? "visible" : "hidden" }}
        >
          {/* Selected time preview */}
          <p className="text-center text-base font-semibold text-foreground mb-2 tabular-nums">
            {formatDisplay(`${selectedHour}:${selectedMinute}`)}
          </p>

          {/* Column scrollers */}
          <div className="flex gap-2">
            {/* Hours */}
            <div className="flex-1">
              <p className="type-caption font-semibold text-muted-foreground text-center mb-1 uppercase tracking-wider">Hour</p>
              <div
                ref={hourRef}
                className="h-40 overflow-y-auto rounded-md border border-border"
                style={{ scrollbarWidth: "none" }}
              >
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    data-selected={selectedHour === h ? "" : undefined}
                    onClick={() => setSelectedHour(h)}
                    className={cn(
                      "w-full py-1.5 text-sm text-center transition-colors rounded-none",
                      selectedHour === h
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    {formatDisplay(`${h}:00`).split(":")[0]}
                    <span className="type-caption ml-1 opacity-60">
                      {Number(h) < 12 ? "AM" : "PM"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Minutes */}
            <div className="flex-1">
              <p className="type-caption font-semibold text-muted-foreground text-center mb-1 uppercase tracking-wider">Min</p>
              <div
                ref={minuteRef}
                className="h-40 overflow-y-auto rounded-md border border-border"
                style={{ scrollbarWidth: "none" }}
              >
                {minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    data-selected={selectedMinute === m ? "" : undefined}
                    onClick={() => setSelectedMinute(m)}
                    className={cn(
                      "w-full py-1.5 text-sm text-center transition-colors rounded-none",
                      selectedMinute === m
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    :{m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 mt-3">
            {allowClear && <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              Clear
            </button>}
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        </div>,
        // Stay inside the enclosing modal focus boundary; ordinary page filters still use body.
        portalTarget ?? document.body
      )}
    </div>
  );
}
