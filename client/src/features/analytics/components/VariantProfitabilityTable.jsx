import { useState } from "react";
import { useVariantProfitability } from "../variantQuery";
import { useCategoryList } from "@/features/products/query";
import { SearchBar } from "@/components/filters/SearchBar";
import FilterModal from "@/components/filters/FilterModal";
import { Pagination } from "@/components/filters/Pagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, MoneyCell, NumCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { value: "profit_desc", label: "Profit: High to Low" },
  { value: "profit_asc", label: "Profit: Low to High" },
  { value: "margin_desc", label: "Margin: High to Low" },
  { value: "margin_asc", label: "Margin: Low to High" },
  { value: "units_desc", label: "Units Sold: High to Low" },
  { value: "net_sales_desc", label: "Net Sales: High to Low" },
];

const MARGIN_BAND_OPTIONS = [
  { value: "all", label: "All margins" },
  { value: "low", label: "At-risk: below 20%" },
  { value: "mid", label: "Normal: 20–90%" },
  { value: "high", label: "Stellar: 90% and up" },
];

function marginTone(margin) {
  const m = Number(margin);
  if (m < 20) return "text-red-500 dark:text-red-400";
  if (m >= 90) return "text-emerald-600 dark:text-emerald-400";
  return "text-amber-600 dark:text-amber-400";
}

export default function VariantProfitabilityTable({ dateFrom, dateTo }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // 10-row default keeps the dashboard compact; 20/50/100 selectable.
  const [pageSize, setPageSize] = useState(10);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSort, setActiveSort] = useState("profit_desc");
  const [activeFilters, setActiveFilters] = useState({ category: "all", margin: "all" });

  const { data: categoriesData } = useCategoryList();
  const categories = categoriesData?.data?.categories ?? categoriesData?.data ?? [];
  // Subcategories only — roots are grouping headers, never filter targets
  // (same convention + `sub:<id>` wire format as the Products module).
  const categoryOptions = [
    { value: "all", label: "All Categories" },
    ...categories.flatMap((cat) =>
      (cat.subcategories || []).map((sub) => ({
        value: `sub:${sub.subcategory_id ?? sub.id}`,
        label: sub.subcategory_name ?? sub.name,
      })),
    ),
  ];

  const filterActive =
    activeFilters.category !== "all" ||
    activeFilters.margin !== "all" ||
    activeSort !== "profit_desc";

  const { data, isLoading } = useVariantProfitability({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    search: search || undefined,
    category: activeFilters.category !== "all" ? activeFilters.category : undefined,
    sort: activeSort,
    margin_band: activeFilters.margin !== "all" ? activeFilters.margin : undefined,
    limit: String(pageSize),
    page: String(page),
  });
  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;

  function handleFilterApply(sort, filters) {
    setActiveSort(sort || "profit_desc");
    setActiveFilters({ category: "all", margin: "all", ...filters });
    setPage(1);
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Variant Profitability</h3>
        <div className="w-64">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search variant..."
            onFilterClick={() => setFilterOpen(true)}
            filterActive={filterActive}
          />
        </div>
      </div>
      <FilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        sortOptions={SORT_OPTIONS}
        filterOptions={[
          { key: "category", label: "Category", options: categoryOptions },
          { key: "margin", label: "Margin", options: MARGIN_BAND_OPTIONS },
        ]}
        onApply={handleFilterApply}
        currentSort={activeSort}
        currentFilters={activeFilters}
      />
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
            <TableRow><TableCell colSpan={6} className="py-4"><div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div></TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={6}><EmptyState icon="trendingUp" title="No variants" copy="No variants match these filters." className="py-8" /></TableCell></TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.variant_id}>
                <TableCell className="max-w-[260px] truncate font-medium">{r.product_name} - {r.size_name}</TableCell>
                <NumCell className="whitespace-nowrap">{r.units}</NumCell>
                <MoneyCell className="whitespace-nowrap">{formatPeso(r.net_sales)}</MoneyCell>
                <MoneyCell className="whitespace-nowrap text-amber-600 dark:text-amber-400">{formatPeso(r.cogs)}</MoneyCell>
                <MoneyCell strong className={cn("whitespace-nowrap", Number(r.profit) < 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>{formatPeso(r.profit)}</MoneyCell>
                <NumCell className={cn("whitespace-nowrap", marginTone(r.margin))}>{r.margin}%</NumCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination currentPage={page} totalItems={total} pageSize={pageSize} pageSizeOptions={[10, 20, 50, 100]} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="variants" />
    </div>
  );
}
