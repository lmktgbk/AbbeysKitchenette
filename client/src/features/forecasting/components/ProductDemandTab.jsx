import React, { useState, useMemo } from "react";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";

const TREND_LABEL = { increasing: "Rising", decreasing: "Falling", stable: "Steady" };
const TREND_COLOR = { increasing: "bg-green-100 text-green-700 border-green-200", decreasing: "bg-red-100 text-red-700 border-red-200", stable: "bg-gray-100 text-gray-600 border-gray-200" };

export default function ProductDemandTab({ results }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    if (!search.trim()) return results;
    const q = search.toLowerCase();
    return results.filter((r) => `${r.product_name} ${r.size_name}`.toLowerCase().includes(q));
  }, [results, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize).map((r) => {
      const units = r.daily_data.slice(0, 7).reduce((s, d) => s + d.units, 0);
      const revenue = r.daily_data.slice(0, 7).reduce((s, d) => s + d.revenue, 0);
      return { ...r, units, revenue };
    });
  }, [filtered, page]);

  // reset page when search changes
  React.useEffect(() => { setPage(1); }, [search]);

  if (!results.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No products in this forecast</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">By Product</h3>
          <p className="text-xs text-muted-foreground">{filtered.length} products · how many to prepare next 7 days</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search products..." className="max-w-[220px]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Product</th>
              <th className="px-4 py-2 text-center font-medium">To Prepare</th>
              <th className="px-4 py-2 text-right font-medium">Expected Sales</th>
              <th className="px-4 py-2 text-center font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => (
              <tr key={r.variant_id} className="border-b border-border last:border-0 hover:bg-muted/20">
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
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalItems={filtered.length} pageSize={pageSize} onPageChange={setPage} pageSizeOptions={[10]} itemLabel="products" />
    </div>
  );
}
