import React, { useState, useMemo } from "react";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { FilterPill } from "@/components/filters/FilterPill";

const TREND_LABEL = { increasing: "Rising", decreasing: "Falling", stable: "Steady" };
const TREND_COLOR = { increasing: "bg-green-100 text-green-700 border-green-200", decreasing: "bg-red-100 text-red-700 border-red-200", stable: "bg-gray-100 text-gray-600 border-gray-200" };

export default function ProductDemandTab({ results, activeTab, onTabChange, selectedVariant, onSelectVariant }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const demandOnly = useMemo(() => results.filter((r) => r.daily_data.slice(0, 7).reduce((s, d) => s + d.units, 0) > 0), [results]);

  const filtered = useMemo(() => {
    if (!search.trim()) return demandOnly;
    const q = search.toLowerCase();
    return demandOnly.filter((r) => `${r.product_name} ${r.size_name}`.toLowerCase().includes(q));
  }, [demandOnly, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize).map((r) => {
      const units = r.daily_data.slice(0, 7).reduce((s, d) => s + d.units, 0);
      const revenue = r.daily_data.slice(0, 7).reduce((s, d) => s + d.revenue, 0);
      return { ...r, units, revenue };
    });
  }, [filtered, page, pageSize]);

  React.useEffect(() => { setPage(1); }, [search, demandOnly]);

  if (!results.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No products in this forecast</p>;
  }

  if (!demandOnly.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No products with forecasted demand in the next 7 days</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Product Forecast</h3>
          <p className="text-xs text-muted-foreground">{filtered.length} products with demand · next 7 days</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search products..." className="max-w-[280px] flex-1" />
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
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Product</th>
              <th className="px-4 py-2 text-center font-medium">Forecasted Demand</th>
              <th className="px-4 py-2 text-right font-medium">Expected Sales</th>
              <th className="px-4 py-2 text-center font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const isSelected = String(selectedVariant) === String(r.variant_id);
              return (
                <tr
                  key={r.variant_id}
                  onClick={() => onSelectVariant?.(isSelected ? null : String(r.variant_id))}
                  className={`border-b border-border last:border-0 cursor-pointer transition-colors ${isSelected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted/50"}`}
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-foreground">{r.product_name}</p>
                    <p className="text-xs text-muted-foreground">{r.size_name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold text-foreground">{r.units.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">₱{r.total_revenue.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TREND_COLOR[r.trend] || TREND_COLOR.stable}`}>
                      {TREND_LABEL[r.trend] || "Steady"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} pageSizeOptions={[20, 50, 100]} itemLabel="products" />
    </div>
  );
}
