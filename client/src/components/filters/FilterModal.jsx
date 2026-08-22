import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropDown } from "@/components/filters/DropDown";

/**
 * FilterModal — global reusable sort + filter dialog.
 *
 * Renders a dialog with radio buttons for sort and dropdowns for filters.
 * Fully dynamic — accepts all config via props. No feature-specific logic.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open) => void
 * - sortOptions: Array<{ value: string, label: string }>
 * - filterOptions: Array<{ key: string, label: string, options: Array<{ value: string, label: string }> }>
 * - onApply: (sort: string, filters: Record<string, string>) => void
 * - currentSort: string
 * - currentFilters: Record<string, string>
 */
export default function FilterModal({
  open,
  onOpenChange,
  sortOptions = [],
  filterOptions = [],
  onApply,
  currentSort,
  currentFilters = {},
}) {
  const [selectedSort, setSelectedSort] = useState(currentSort || "");
  const [selectedFilters, setSelectedFilters] = useState({ ...currentFilters });

  // Sync local state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedSort(currentSort || "");
      setSelectedFilters({ ...currentFilters });
    }
  }, [open, currentSort, currentFilters]);

  function handleFilterChange(key, value) {
    setSelectedFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleApply() {
    onApply(selectedSort, { ...selectedFilters });
    onOpenChange(false);
  }

  function handleReset() {
    setSelectedSort(sortOptions[0]?.value || "");
    const resetFilters = {};
    for (const f of filterOptions) {
      resetFilters[f.key] = f.options[0]?.value || "all";
    }
    setSelectedFilters(resetFilters);
  }

  const hasContent = sortOptions.length > 0 || filterOptions.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Sort & Filter</DialogTitle>
        </DialogHeader>

        {hasContent ? (
          <div className="flex flex-col gap-5 py-2">
            {/* Sort Section */}
            {sortOptions.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Sort by</p>
                <div className="flex flex-col gap-1">
                  {sortOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
                        selectedSort === opt.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <input
                        type="radio"
                        name="sort"
                        value={opt.value}
                        checked={selectedSort === opt.value}
                        onChange={() => setSelectedSort(opt.value)}
                        className="accent-primary"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Filter Sections */}
            {filterOptions.map((filter) => (
              <div key={filter.key}>
                <p className="text-sm font-medium text-foreground mb-2">{filter.label}</p>
                <DropDown
                  options={filter.options}
                  value={selectedFilters[filter.key] || filter.options[0]?.value || "all"}
                  onChange={(val) => handleFilterChange(filter.key, val)}
                  size="sm"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-muted-foreground text-sm">
            No sort or filter options available.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
