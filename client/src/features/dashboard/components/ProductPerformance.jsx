import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { SearchableDropDown } from "@/components/filters/SearchableDropDown";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ProductPerformance — toggle between all products table and variant drill-down.
 *
 * @param {Object} props
 * @param {Array} props.data - [{ variantId, productName, sizeName, price, unitsSold, revenue, cost, margin }]
 * @param {boolean} props.isLoading
 */
function ProductPerformance({ data, isLoading }) {
  const [view, setView] = useState("products");
  const [selectedProduct, setSelectedProduct] = useState("all");

  const productOptions = useMemo(() => {
    if (!data?.length) return [];
    const products = [...new Set(data.map((d) => d.productName))];
    return [
      { value: "all", label: "All Products" },
      ...products.map((p) => ({ value: p, label: p })),
    ];
  }, [data]);

  const productRows = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map();
    for (const row of data) {
      const existing = map.get(row.productName);
      if (existing) {
        existing.unitsSold += row.unitsSold;
        existing.revenue += row.revenue;
        existing.cost += row.cost;
      } else {
        map.set(row.productName, {
          productName: row.productName,
          unitsSold: row.unitsSold,
          revenue: row.revenue,
          cost: row.cost,
        });
      }
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        margin: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue * 100).toFixed(1) : "0.0",
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const variantRows = useMemo(() => {
    if (!data?.length) return [];
    const filtered = selectedProduct === "all"
      ? data
      : data.filter((d) => d.productName === selectedProduct);
    return filtered.sort((a, b) => b.revenue - a.revenue);
  }, [data, selectedProduct]);

  const activeRows = view === "products" ? productRows : variantRows;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Product Performance</h3>
        <div className="flex items-center gap-2">
          {view === "variants" && (
            <SearchableDropDown
              options={productOptions}
              value={selectedProduct}
              onChange={setSelectedProduct}
              placeholder="All Products"
              searchPlaceholder="Search product..."
              className="w-48"
            />
          )}
          <div className="flex rounded-md border border-border overflow-hidden">
            {[
              { value: "products", label: "Products" },
              { value: "variants", label: "Variants" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setView(opt.value)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  view === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeRows.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No data available
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {view === "products" ? "Product" : "Variant"}
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Units Sold
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Revenue
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Cost
                </th>
                <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Margin
                </th>
              </tr>
            </thead>
            <tbody>
              {activeRows.map((row, i) => (
                <tr
                  key={view === "products" ? row.productName : row.variantId || i}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {view === "products" ? (
                      row.productName
                    ) : (
                      <span>
                        {row.productName} <span className="text-muted-foreground">({row.sizeName})</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {row.unitsSold.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">
                    ₱{row.revenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    ₱{Number(row.cost).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        Number(row.margin) >= 30
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : Number(row.margin) >= 15
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}
                    >
                      {row.margin}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default React.memo(ProductPerformance);
