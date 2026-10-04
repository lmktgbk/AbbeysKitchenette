import { useResettableState } from "@/hooks/useResettableState";
import { useState, useMemo } from "react";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { FilterPill } from "@/components/filters/FilterPill";
import FilterModal from "@/components/filters/FilterModal";
import { TableHead, TableHeader, TableRow, NumCell } from "@/components/ui/table";
import { Pill } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: "attention", label: "Attention first" },
  { value: "need_desc", label: "Need: High to Low" },
  { value: "lasts_asc", label: "Lasts: Shortest first" },
  { value: "name_asc", label: "Name: A to Z" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "critical", label: "Order now" },
  { value: "warning", label: "Low" },
  { value: "ok", label: "OK" },
];

const LASTS_BANDS = [
  { value: "all", label: "All cover" },
  { value: "low", label: "Under 7 days" },
  { value: "mid", label: "7–30 days" },
  { value: "high", label: "Over 30 days" },
];

const STATUS_ORDER = { critical: 0, warning: 1, ok: 2 };

function inLastsBand(days, band) {
  if (band !== "low" && band !== "mid" && band !== "high") return true;
  if (days == null) return band === "high";
  if (band === "low") return days < 7;
  if (band === "mid") return days >= 7 && days <= 30;
  return days > 30;
}

const STATUS_VARIANT = { ok: "success", warning: "warning", critical: "destructive" };
const STATUS_LABEL = { ok: "OK", warning: "Low", critical: "Order now" };

export default function IngredientOrderTab({ ingredients, activeTab, onTabChange }) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSort, setActiveSort] = useState("attention");
  const [activeFilters, setActiveFilters] = useState({ status: "all", lasts: "all" });

  const [page, setPage] = useResettableState(1, [search, activeSort, activeFilters]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ingredients;
    const q = search.toLowerCase();
    return ingredients.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, search]);

  const sorted = useMemo(() => {
    const list = filtered.filter(
      (i) =>
        (activeFilters.status === "all" || i.status === activeFilters.status) &&
        inLastsBand(i.days_covered, activeFilters.lasts),
    );
    const arr = [...list];
    switch (activeSort) {
      case "need_desc":
        arr.sort((a, b) => (b.total_needed ?? 0) - (a.total_needed ?? 0));
        break;
      case "lasts_asc":
        arr.sort((a, b) => (a.days_covered ?? Infinity) - (b.days_covered ?? Infinity));
        break;
      case "name_asc":
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default: // attention — Order now first (pre-filter default order)
        arr.sort((a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2));
    }
    return arr;
  }, [filtered, activeSort, activeFilters]);

  const paged = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);


  const filterActive =
    activeSort !== "attention" ||
    activeFilters.status !== "all" ||
    activeFilters.lasts !== "all";

  function handleFilterApply(sort, filters) {
    setActiveSort(sort || "attention");
    setActiveFilters({ status: "all", lasts: "all", ...filters });
    setPage(1);
  }

  if (!ingredients.length) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon="package"
          title="No ingredient needs"
          copy="All stock looks good for this forecast."
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Ingredient Forecast</h3>
            <p className="text-xs text-muted-foreground">{sorted.filter((i) => i.status !== "ok").length} need attention · sorted: Order now first</p>
          </div>
          {activeTab && onTabChange && (
            <FilterPill
              options={[
                { value: "products", label: "Product Forecast" },
                { value: "ingredients", label: "Ingredient Forecast" },
              ]}
              value={activeTab}
              onChange={onTabChange}
            />
          )}
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search ingredients..." className="mt-2.5 w-full" onFilterClick={() => setFilterOpen(true)} filterActive={filterActive} />
      </div>
      <FilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        sortOptions={SORT_OPTIONS}
        filterOptions={[
          { key: "status", label: "Status", options: STATUS_FILTER_OPTIONS },
          { key: "lasts", label: "Stock Cover", options: LASTS_BANDS },
        ]}
        onApply={handleFilterApply}
        currentSort={activeSort}
        currentFilters={activeFilters}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient</TableHead>
              <TableHead className="w-32 text-right">Need</TableHead>
              <TableHead className="w-32 text-right">In Stock</TableHead>
              <TableHead className="w-24 text-center">Lasts</TableHead>
              <TableHead className="w-28 text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {paged.map((ing) => (
              <tr key={ing.ingredient_id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-foreground">{ing.name}</p>
                  <p className="text-xs text-muted-foreground">{ing.unit}</p>
                </td>
                <NumCell strong className={cn("whitespace-nowrap py-2.5", ing.status !== "ok" && "text-amber-700 dark:text-amber-400")}>{ing.total_needed.toLocaleString()} {ing.unit}</NumCell>
                <NumCell className="whitespace-nowrap py-2.5 text-muted-foreground">{ing.current_stock.toLocaleString()}</NumCell>
                <NumCell align="center" className="whitespace-nowrap py-2.5">{ing.days_covered != null ? `${ing.days_covered}d` : "—"}</NumCell>
                <td className="whitespace-nowrap px-4 py-2.5 text-center">
                  <Pill variant={STATUS_VARIANT[ing.status] || "success"}>{STATUS_LABEL[ing.status] || ing.status}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={sorted.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} pageSizeOptions={[20, 50, 100]} itemLabel="ingredients" />
      <p className="px-4 py-2 text-xs text-muted-foreground">Tip: “Lasts” = how many days your current stock will cover at forecasted demand.</p>
    </div>
  );
}
