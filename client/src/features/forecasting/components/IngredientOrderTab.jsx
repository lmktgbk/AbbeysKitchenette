import React, { useState, useMemo } from "react";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { FilterPill } from "@/components/filters/FilterPill";

const STATUS_STYLE = {
  ok: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABEL = { ok: "OK", warning: "Low", critical: "Order now" };

export default function IngredientOrderTab({ ingredients, activeTab, onTabChange }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtered = useMemo(() => {
    if (!search.trim()) return ingredients;
    const q = search.toLowerCase();
    return ingredients.filter((i) => i.name.toLowerCase().includes(q));
  }, [ingredients, search]);

  const sorted = useMemo(() => {
    const order = { critical: 0, warning: 1, ok: 2 };
    return [...filtered].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
  }, [filtered]);

  const paged = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  React.useEffect(() => { setPage(1); }, [search]);

  if (!ingredients.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No ingredient needs for this forecast — all stock looks good</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Ingredient Forecast</h3>
          <p className="text-xs text-muted-foreground">{sorted.filter((i) => i.status !== "ok").length} need attention · sorted: Order now first</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search ingredients..." className="max-w-[280px] flex-1" />
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
              <th className="px-4 py-2 text-left font-medium">Ingredient</th>
              <th className="px-4 py-2 text-right font-medium">Need</th>
              <th className="px-4 py-2 text-right font-medium">In Stock</th>
              <th className="px-4 py-2 text-center font-medium">Lasts</th>
              <th className="px-4 py-2 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((ing) => (
              <tr key={ing.ingredient_id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-foreground">{ing.name}</p>
                  <p className="text-xs text-muted-foreground">{ing.unit}</p>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-foreground">{ing.total_needed.toLocaleString()} {ing.unit}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{ing.current_stock.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-center text-foreground">{ing.days_covered != null ? `${ing.days_covered}d` : "—"}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[ing.status] || STATUS_STYLE.ok}`}>
                    {STATUS_LABEL[ing.status] || ing.status}
                  </span>
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
