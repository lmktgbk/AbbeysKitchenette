import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { Pagination } from "@/components/filters/Pagination";
import { SearchBar } from "@/components/filters/SearchBar";

const STATUS_CONFIG = {
  ok: { variant: "success", label: "OK" },
  warning: { variant: "warning", label: "Low Stock" },
  critical: { variant: "destructive", label: "Critical" },
};

/**
 * IngredientNeeds — ingredient requirements summary with stock coverage and pagination.
 * Always shows aggregate across all forecasted variants.
 */
export default function IngredientNeeds({ ingredients }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");

  useEffect(() => { setCurrentPage(1); }, [ingredients, search]);

  const sortedIngredients = useMemo(() => {
    if (!ingredients?.length) return [];
    const priority = { critical: 0, warning: 1, ok: 2 };
    let list = [...ingredients].sort((a, b) => (priority[a.status] ?? 3) - (priority[b.status] ?? 3));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [ingredients, search]);

  const startIdx = (currentPage - 1) * pageSize;
  const pagedIngredients = sortedIngredients.slice(startIdx, startIdx + pageSize);

  if (!ingredients?.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No ingredient data available
        </div>
      </div>
    );
  }

  const critical = ingredients.filter((i) => i.status === "critical");
  const warning = ingredients.filter((i) => i.status === "warning");

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Ingredient Needs</h3>
        <div className="flex items-center gap-2">
          {critical.length > 0 && (
            <Badge variant="destructive">{critical.length} critical</Badge>
          )}
          {warning.length > 0 && (
            <Badge variant="warning">{warning.length} low</Badge>
          )}
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search ingredient..."
            className="w-44"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Ingredient</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Unit</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total Needed</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">In Stock</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Days Left</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground min-w-[120px]">Stock Coverage</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {pagedIngredients.map((ing) => {
              const sc = STATUS_CONFIG[ing.status] || STATUS_CONFIG.ok;
              const coverage = ing.total_needed > 0
                ? Math.min((ing.current_stock / ing.total_needed) * 100, 100)
                : 100;

              return (
                <tr key={ing.ingredient_id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-2.5 font-medium text-foreground">{ing.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ing.unit}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">
                    {ing.total_needed.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {ing.current_stock.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-foreground">
                    {ing.days_covered != null ? `${ing.days_covered}d` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          ing.status === "critical"
                            ? "bg-red-500"
                            : ing.status === "warning"
                              ? "bg-yellow-500"
                              : "bg-green-500"
                        )}
                        style={{ width: `${coverage}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant={sc.variant}>{sc.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalItems={sortedIngredients.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 20, 30]}
        itemLabel="ingredients"
      />

      <div className="flex items-start gap-1.5 border-t border-border px-4 py-2.5">
        <Icon name="info" size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Totals across all forecasted variants. This is what you need to order.
        </p>
      </div>
    </div>
  );
}
