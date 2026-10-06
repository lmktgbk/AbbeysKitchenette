import { formatPeso } from "@/lib/money";
import { formatDemand } from "../formatDemand";
import { useResettableState } from "@/hooks/useResettableState";
import React, { useState, useMemo } from "react";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { FilterPill } from "@/components/filters/FilterPill";
import FilterModal from "@/components/filters/FilterModal";
import { TableHead, TableHeader, TableRow, NumCell, MoneyCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";

const SORT_OPTIONS = [
  { value: "units_desc", label: "Demand: High to Low" },
  { value: "units_asc", label: "Demand: Low to High" },
  { value: "revenue_desc", label: "Sales: High to Low" },
  { value: "revenue_asc", label: "Sales: Low to High" },
  { value: "name_asc", label: "Name: A to Z" },
];

const DEMAND_BANDS = [
  { value: "all", label: "All demand" },
  { value: "low", label: "Under 10 items" },
  { value: "mid", label: "10–50 items" },
  { value: "high", label: "Over 50 items" },
];

const SALES_BANDS = [
  { value: "all", label: "All sales" },
  { value: "low", label: "Under ₱1K" },
  { value: "mid", label: "₱1K–₱5K" },
  { value: "high", label: "Over ₱5K" },
];

function inDemandBand(units, band) {
  if (band === "low") return units < 10;
  if (band === "mid") return units >= 10 && units <= 50;
  if (band === "high") return units > 50;
  return true;
}

function inSalesBand(revenue, band) {
  if (band === "low") return revenue < 1000;
  if (band === "mid") return revenue >= 1000 && revenue <= 5000;
  if (band === "high") return revenue > 5000;
  return true;
}

// Rows are variants; products group them. product_id arrives on new jobs —
// old jobs fall back to grouping by product_name.
function groupKey(r) {
  return r.product_id != null ? `id:${r.product_id}` : `name:${r.product_name}`;
}

export default function ProductDemandTab({
  results, productScores, activeTab, onTabChange,
  selectedVariant, selectedProduct, onSelectVariant, onSelectProduct,
}) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [expanded, setExpanded] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSort, setActiveSort] = useState("units_desc");
  const [activeFilters, setActiveFilters] = useState({ demand: "all", sales: "all" });

  const scoreByProduct = useMemo(() => {
    const map = new Map();
    for (const s of productScores || []) {
      map.set(s.product_id, s);
    }
    return map;
  }, [productScores]);

  // Group variants under products; hide products with zero total demand.
  const products = useMemo(() => {
    const map = new Map();
    for (const r of results) {
      const key = groupKey(r);
      if (!map.has(key)) {
        map.set(key, {
          key,
          product_id: r.product_id,
          product_name: r.product_name,
          category_id: r.category_id,
          variants: [],
        });
      }
      const week = r.daily_data.slice(0, 7);
      const units = week.reduce((s, d) => s + d.units, 0);
      const revenue = week.reduce((s, d) => s + d.revenue, 0);
      map.get(key).variants.push({ ...r, units, revenue });
    }
    return Array.from(map.values())
      .map((p) => ({
        ...p,
        units: p.variants.reduce((s, v) => s + v.units, 0),
        revenue: p.variants.reduce((s, v) => s + v.revenue, 0),
        score: p.product_id != null ? scoreByProduct.get(p.product_id) : null,
      }))
      .filter((p) => p.units > 0)
      .sort((a, b) => b.units - a.units);
  }, [results, scoreByProduct]);

  const [page, setPage] = useResettableState(1, [search, products, activeSort, activeFilters]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = products.filter(
      (p) =>
        (!q || p.product_name.toLowerCase().includes(q)) &&
        inDemandBand(p.units, activeFilters.demand) &&
        inSalesBand(p.revenue, activeFilters.sales),
    );
    const sorted = [...list];
    switch (activeSort) {
      case "units_asc":
        sorted.sort((a, b) => a.units - b.units);
        break;
      case "revenue_desc":
        sorted.sort((a, b) => b.revenue - a.revenue);
        break;
      case "revenue_asc":
        sorted.sort((a, b) => a.revenue - b.revenue);
        break;
      case "name_asc":
        sorted.sort((a, b) => a.product_name.localeCompare(b.product_name));
        break;
      default: // units_desc — same as the pre-filter default order
        sorted.sort((a, b) => b.units - a.units);
    }
    return sorted;
  }, [products, search, activeSort, activeFilters]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);


  const toggle = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const filterActive =
    activeSort !== "units_desc" ||
    activeFilters.demand !== "all" ||
    activeFilters.sales !== "all";

  function handleFilterApply(sort, filters) {
    setActiveSort(sort || "units_desc");
    setActiveFilters({ demand: "all", sales: "all", ...filters });
    setPage(1);
  }

  if (!results.length) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon="trendingUp"
          title="No products in this forecast"
          copy="Run a forecast to generate predictions."
        />
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <EmptyState
          icon="trendingUp"
          title="No forecasted demand"
          copy="No products with forecasted demand in the selected period."
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Product Forecast</h3>
            <p className="text-xs text-muted-foreground">{filtered.length} products with demand · selected forecast period</p>
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
        <SearchBar value={search} onChange={setSearch} placeholder="Search products..." className="mt-2.5 w-full" onFilterClick={() => setFilterOpen(true)} filterActive={filterActive} />
      </div>
      <FilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        sortOptions={SORT_OPTIONS}
        filterOptions={[
          { key: "demand", label: "Forecasted Demand", options: DEMAND_BANDS },
          { key: "sales", label: "Expected Sales", options: SALES_BANDS },
        ]}
        onApply={handleFilterApply}
        currentSort={activeSort}
        currentFilters={activeFilters}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-36 text-center">Forecasted Demand</TableHead>
              <TableHead className="w-40 text-center">Expected Sales</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {paged.map((p) => {
              const isOpen = !!expanded[p.key];
              const isProductSelected = selectedProduct && String(selectedProduct) === String(p.product_id ?? p.product_name);
              return (
                <React.Fragment key={p.key}>
                  <tr
                    onClick={() => {
                      if (p.variants.length > 1) toggle(p.key);
                      onSelectProduct?.(isProductSelected ? null : (p.product_id ?? p.product_name));
                    }}
                    className={`border-b border-border cursor-pointer transition-colors ${isProductSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/50"}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {p.variants.length > 1 && (
                          <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={14} className="shrink-0 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{p.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.variants.length > 1 ? `${p.variants.length} sizes` : p.variants[0].size_name}
                            {p.score?.r_squared != null ? ` · R² ${(p.score.r_squared * 100).toFixed(0)}%` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <NumCell strong align="center" className="whitespace-nowrap py-2.5">{formatDemand(p.units)}</NumCell>
                    <MoneyCell strong align="center" className="whitespace-nowrap py-2.5 text-emerald-600 dark:text-emerald-400">{formatPeso(p.revenue, 2)}</MoneyCell>
                  </tr>
                  {isOpen && p.variants.map((v) => {
                    const isSelected = String(selectedVariant) === String(v.variant_id);
                    return (
                      <tr
                        key={v.variant_id}
                        onClick={() => onSelectVariant?.(isSelected ? null : String(v.variant_id))}
                        className={`border-b border-border last:border-0 cursor-pointer transition-colors ${isSelected ? "bg-primary/10 hover:bg-primary/15" : "bg-muted/20 hover:bg-muted/50"}`}
                      >
                        <td className="px-4 py-2 pl-10">
                          <p className="font-medium text-foreground">{v.size_name}</p>
                          {v.current_available === false && <p className="text-xs text-amber-700">Currently unavailable · demand estimate retained</p>}
                          <p className="text-xs text-muted-foreground">
                            {v.share != null ? `${(v.share * 100).toFixed(0)}% historical mix of ${p.product_name} (estimated)` : p.product_name}
                          </p>
                        </td>
                        <NumCell align="center" className="whitespace-nowrap py-2">{formatDemand(v.units)}</NumCell>
                        <MoneyCell align="center" className="whitespace-nowrap py-2 text-emerald-600 dark:text-emerald-400">{formatPeso(v.revenue, 2)}</MoneyCell>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} pageSizeOptions={[20, 50, 100]} itemLabel="products" />
    </div>
  );
}
