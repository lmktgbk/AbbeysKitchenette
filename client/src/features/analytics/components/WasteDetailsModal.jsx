import { useState } from "react";
import { useWasteDetails } from "../variantQuery";
import { SearchBar } from "@/components/filters/SearchBar";
import { FilterPill } from "@/components/filters/FilterPill";
import { Pagination } from "@/components/filters/Pagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";
import { Badge } from "@/components/ui/badge";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "spillage", label: "Spillage" },
  { value: "spoilage", label: "Spoilage" },
  { value: "expiry", label: "Expiry" },
  { value: "cancellation", label: "Cancellation" },
  { value: "other", label: "Other" },
];

export default function WasteDetailsModal({ open, onOpenChange, type, dateFrom, dateTo }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterType, setFilterType] = useState(type || "all");

  const { data, isLoading } = useWasteDetails({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    type: filterType,
    search: search || undefined,
    limit: String(pageSize),
    page: String(page),
  });
  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4 shrink-0">
          <DialogHeader className="mb-0">
            <DialogTitle>Waste Details — {filterType === "all" ? "All types" : filterType}</DialogTitle>
          </DialogHeader>
          <DialogClose onClick={() => onOpenChange(false)} className="static shrink-0" />
        </div>
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0"><SearchBar value={search} onChange={setSearch} placeholder="Search ingredient or note..." /></div>
          <FilterPill options={TYPE_OPTIONS} value={filterType} onChange={(v) => { setFilterType(v); setPage(1); }} />
        </div>
        <div className="flex-1 overflow-auto min-h-0">
          <Table noOverflow className="min-w-[640px]">
            <TableHeader className="sticky top-0 bg-card z-10 shadow-[0_1px_0_var(--border)]">
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Ingredient</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6">Loading...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No records</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.loss_id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.logged_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium max-w-[160px] truncate" title={r.ingredient_name}>{r.ingredient_name}</TableCell>
                    <TableCell><Badge variant="secondary">{r.type}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">{Number(r.quantity_lost).toLocaleString()} {r.unit}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatPeso(r.total_cost_lost)}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground" title={r.notes}>{r.notes || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="shrink-0">
          <Pagination currentPage={page} totalItems={total} pageSize={pageSize} pageSizeOptions={[20, 50, 100]} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="records" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
