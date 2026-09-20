import { useState, useMemo } from "react";
import { useTransactions } from "../query";
import { useStaffList } from "@/features/staff/query";
import { printReceipt } from "@/features/receipts/api";
import { SearchBar } from "@/components/filters/SearchBar";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import FilterModal from "@/components/filters/FilterModal";
import { Pagination } from "@/components/filters/Pagination";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/money";
import { orderNumberLabel } from "@/lib/orderNumber";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "payment", label: "Payments" },
  { value: "refund", label: "Refunds" },
  { value: "variance", label: "Variances" },
];

const METHOD_OPTIONS = [
  { value: "all", label: "All methods" },
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
];

const TYPE_BADGES = {
  payment: { label: "Payment", variant: "success" },
  refund: { label: "Refund", variant: "destructive" },
  variance: { label: "Variance", variant: "warning" },
};

const PAGE_SIZE_OPTIONS = [50, 75, 100];

/**
 * TransactionsView (BR-03)
 *
 * Money ledger as one connected table card: toolbar (search, date,
 * switcher) → ledger → pagination. Type/method/cashier filters live
 * behind the search-bar filter icon (shared FilterModal, Products pattern).
 * The switcher and pairing actions are injected by OrdersPage so both
 * views share one home.
 */
export default function TransactionsView({ switcher, actions }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const queryParams = useMemo(() => ({
    page: String(page),
    limit: String(pageSize),
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    method: methodFilter !== "all" ? methodFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    staff_id: staffFilter !== "all" ? staffFilter : undefined,
  }), [page, pageSize, dateFrom, dateTo, methodFilter, typeFilter, staffFilter]);

  const { data, isLoading } = useTransactions(queryParams);
  const payload = data?.data ?? {};
  const transactions = payload.transactions ?? [];
  const totalItems = payload.totalItems ?? 0;

  // Kitchen staff never handle money — cashiers and admins only.
  const { data: staffData } = useStaffList({ limit: 100 });
  const cashiers = (staffData?.data?.staff ?? []).filter((s) => s.role === "cashier" || s.role === "admin");

  const filterOptions = [
    { key: "type", label: "Type", options: TYPE_OPTIONS },
    { key: "method", label: "Method", options: METHOD_OPTIONS },
    {
      key: "cashier",
      label: "Cashier",
      options: [
        { value: "all", label: "All cashiers" },
        ...cashiers.map((s) => ({ value: s.staff_id, label: s.name })),
      ],
    },
  ];
  const currentFilters = { type: typeFilter, method: methodFilter, cashier: staffFilter };
  const filterActive = typeFilter !== "all" || methodFilter !== "all" || staffFilter !== "all";

  function handleFilterApply(_sort, filters) {
    setTypeFilter(filters.type || "all");
    setMethodFilter(filters.method || "all");
    setStaffFilter(filters.cashier || "all");
    setPage(1);
  }

  const visible = search.trim()
    ? transactions.filter((t) => {
      const q = search.trim().toLowerCase();
      return (
        String(t.order_number ?? "").includes(q)
        || (t.staff_name ?? "").toLowerCase().includes(q)
        || (t.note ?? "").toLowerCase().includes(q)
      );
    })
    : transactions;

  function resetFilters() {
    setPage(1);
    setSearch("");
    setDateFrom(null);
    setDateTo(null);
    setTypeFilter("all");
    setMethodFilter("all");
    setStaffFilter("all");
  }

  const filtering = search || dateFrom || dateTo || typeFilter !== "all" || methodFilter !== "all" || staffFilter !== "all";

  return (
    <div className="flex flex-col gap-4">
      {/* Money header */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MoneyCard label="Money in" value={formatPeso(payload.inflow)} tone="text-green-600 dark:text-green-400" />
        <MoneyCard label="Money out" value={formatPeso(payload.outflow)} tone="text-destructive" />
        <MoneyCard label="Net" value={formatPeso(payload.net)} />
      </div>

      {/* Connected ledger card */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Toolbar — search takes all free space; right cluster docks right */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <div className="min-w-48 max-w-md flex-1">
            <SearchBar
              value={search}
              onChange={(val) => setSearch(val)}
              placeholder="Search #, cashier, note…"
              onFilterClick={() => setFilterOpen(true)}
              filterActive={filterActive}
            />
          </div>
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
          />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {actions}
            {switcher}
          </div>
          {filtering && (
            <button
              type="button"
              onClick={resetFilters}
              className="cursor-pointer text-xs text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <FilterModal
          open={filterOpen}
          onOpenChange={setFilterOpen}
          sortOptions={[]}
          filterOptions={filterOptions}
          onApply={handleFilterApply}
          currentSort=""
          currentFilters={currentFilters}
        />

        <Table noOverflow>
          <TableHeader>
            <TableRow className="hover:bg-muted/50">
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Cashier</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}><div className="h-4 w-full animate-pulse rounded bg-muted" /></TableCell>
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="flex flex-col items-center py-10">
                    <Icon name="receipt" size={28} className="text-muted-foreground/30" />
                    <p className="mt-2 text-xs text-muted-foreground">No money movements match these filters</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((t) => {
                const badge = TYPE_BADGES[t.type] || TYPE_BADGES.payment;
                const positive = Number(t.amount) >= 0;
                return (
                  <TableRow key={t.id} className="hover:bg-muted/50">
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {t.timestamp ? new Date(t.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs capitalize">{t.method}</TableCell>
                    <TableCell className="font-mono text-xs font-bold">
                      {t.order_number != null ? orderNumberLabel(t.order_number) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{t.staff_name ?? "—"}</TableCell>
                    <TableCell className={cn(
                      "text-right text-sm font-bold tabular-nums",
                      positive ? "text-green-600 dark:text-green-400" : "text-destructive",
                    )}>
                      {positive ? "+" : "−"}{formatPeso(Math.abs(Number(t.amount)))}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.type === "payment" && t.order_id ? (
                        <button
                          type="button"
                          title="Print receipt"
                          onClick={() => printReceipt(t.order_id)}
                          className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Icon name="receipt" size={14} />
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground" title={t.note || undefined}>
                          {t.note ? `${t.note.slice(0, 24)}${t.note.length > 24 ? "…" : ""}` : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <Pagination
          currentPage={page}
          totalItems={search.trim() ? visible.length : totalItems}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          itemLabel="transactions"
        />
      </div>
    </div>
  );
}

function MoneyCard({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}
