import { useState } from "react";
import { useVariantProfitability } from "../variantQuery";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";
import { cn } from "@/lib/utils";

export default function VariantProfitabilityTable({ dateFrom, dateTo }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useVariantProfitability({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    search: search || undefined,
    limit: String(pageSize),
    page: String(page),
  });
  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Variant Profitability</h3>
        <div className="w-64">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search variant..." />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variant</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Net Sales</TableHead>
            <TableHead className="text-right">COGS</TableHead>
            <TableHead className="text-right">Profit</TableHead>
            <TableHead className="text-right">Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No variants</TableCell></TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.variant_id}>
                <TableCell className="font-medium">{r.product_name} - {r.size_name}</TableCell>
                <TableCell className="text-right">{r.units}</TableCell>
                <TableCell className="text-right">{formatPeso(r.net_sales)}</TableCell>
                <TableCell className="text-right">{formatPeso(r.cogs)}</TableCell>
                <TableCell className={cn("text-right font-semibold", Number(r.profit) < 0 ? "text-red-500" : "text-emerald-600")}>{formatPeso(r.profit)}</TableCell>
                <TableCell className={cn("text-right", Number(r.margin) < 20 ? "text-red-500" : "")}>{r.margin}%</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination currentPage={page} totalItems={total} pageSize={pageSize} pageSizeOptions={[20, 50, 100]} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="variants" />
    </div>
  );
}
