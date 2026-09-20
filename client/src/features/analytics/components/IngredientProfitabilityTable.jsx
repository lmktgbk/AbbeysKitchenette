import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/config/axios";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";
import { cn } from "@/lib/utils";

async function getIngredientProfitabilityRequest(params = {}) {
  const res = await api.get("/analytics/ingredients/profitability", { params });
  return res.data;
}

export default function IngredientProfitabilityTable({ dateFrom, dateTo }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "ingredientProfit", { dateFrom, dateTo, search, page, pageSize }],
    queryFn: () => getIngredientProfitabilityRequest({ date_from: dateFrom || undefined, date_to: dateTo || undefined, search: search || undefined, limit: String(pageSize), page: String(page) }),
  });
  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Ingredient Profitability</h3>
        <div className="w-64">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search ingredient..." />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead className="text-right">Stock Value</TableHead>
            <TableHead className="text-right">Restocks</TableHead>
            <TableHead className="text-right">Total Spend</TableHead>
            <TableHead className="text-right">Waste</TableHead>
            <TableHead className="text-right">Net Position</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No ingredients</TableCell></TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.ingredient_id}>
                <TableCell className="font-medium">{r.ingredient_name} <span className="text-muted-foreground text-xs">({r.unit})</span></TableCell>
                <TableCell className="text-right">{formatPeso(r.stock_value)}</TableCell>
                <TableCell className="text-right">{r.restock_count}×</TableCell>
                <TableCell className="text-right">{formatPeso(r.total_spend)}</TableCell>
                <TableCell className="text-right text-red-500">{formatPeso(r.total_waste)}</TableCell>
                <TableCell className={cn("text-right font-semibold", Number(r.net_position) < 0 ? "text-red-500" : "text-emerald-600")}>{formatPeso(r.net_position)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination currentPage={page} totalItems={total} pageSize={pageSize} pageSizeOptions={[10, 20, 50]} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="ingredients" />
    </div>
  );
}
