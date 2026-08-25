import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";

/**
 * SearchableDropDown — dropdown with type-ahead search filtering.
 * Opens on click, type to filter, pick one option, closes.
 *
 * @param {Object} props
 * @param {{ value: string, label: string }[]} props.options
 * @param {string} [props.value]
 * @param {(value: string) => void} props.onChange
 * @param {string} [props.placeholder]
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 */
export function SearchableDropDown({
  options = [],
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const ref = useRef(null);

  const selected = options.find((opt) => opt.value === value);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, search]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  function handleSelect(opt) {
    onChange(opt.value);
    setOpen(false);
    setSearch("");
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
            setOpenUp(spaceBelow < 280);
          }
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-transparent px-3 text-sm transition-colors",
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
        <div
          className={cn(
            "absolute z-50 w-full rounded-lg border border-border bg-card shadow-lg",
            openUp ? "bottom-full mb-1" : "mt-1"
          )}
        >
          {/* Search input */}
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <Icon name="search" size={14} className="shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              filtered.map((opt) => (
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
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
