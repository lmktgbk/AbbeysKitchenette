import { useMemo } from "react";
import { DropDown } from "@/components/filters/DropDown";
import { useDiningTableOptions } from "@/features/landing/query";

/**
 * TableSelect — dining-table dropdown fed by Settings (diningTables).
 *
 * WHY it exists: one table picker for the POS summary and the guest
 * checkout so both offer exactly the admin-configured tables + Takeout.
 * Falls back to Tables 1–8 + Takeout when unset. A value outside the list
 * (legacy free-text orders being fulfilled) is kept as an extra read-only
 * option so it is never silently dropped.
 *
 * Takeout stores the literal "Takeout" string (matches the dashboard
 * fallback label; searchable and export-safe).
 */
export default function TableSelect({ value, onChange, placeholder = "Select table", className }) {
  const baseOptions = useDiningTableOptions();
  const options = useMemo(() => {
    if (!value || baseOptions.some((o) => o.value === value)) return baseOptions;
    // Legacy free-text value (e.g. loaded old order): keep it selectable.
    return [...baseOptions, { value, label: `${value} (custom)` }];
  }, [baseOptions, value]);

  if (baseOptions.length === 0) {
    return (
      <p className="text-xs text-destructive">
        No tables configured — enable tables or takeout in Settings.
      </p>
    );
  }
  return (
    <DropDown
      options={options}
      value={value || ""}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
