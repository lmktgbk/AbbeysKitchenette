import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/config/axios";
import { SearchBar } from "@/components/filters/SearchBar";
import FilterModal from "@/components/filters/FilterModal";
import { Pagination } from "@/components/filters/Pagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatPeso } from "@/features/dashboard/utils/dashboardUtils";

async function getIngredientProfitabilityRequest(params = {}) {
  const res = await api.get("/analytics/ingredients/profitability", { params });
  return res.data;
}

async function getIngredientUnitsRequest() {
  const res = await api.get("/analytics/ingredients/units");
  return res.data?.data?.units ?? [];
}

const SORT_OPTIONS = [
  { value: "stock_value_desc", label: "Stock Value: High to Low" },
  { value: "stock_value_asc", label: "Stock Value: Low to High" },
  { value: "total_spend_desc", label: "Total Spend: High to Low" },
  { value: "total_waste_desc", label: "Waste: High to Low" },
  { value: "restock_count_desc", label: "Restocks: Most First" },
  { value: "name_asc", label: "Name: A to Z" },
];

const WASTE_OPTIONS = [
  { value: "all", label: "All ingredients" },
  { value: "with", label: "With waste only" },
  { value: "without", label: "No waste" },
];

export default function IngredientProfitabilityTable({ dateFrom, dateTo }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // 10-row default keeps the dashboard compact; 20/50/100 selectable.
  const [pageSize, setPageSize] = useState(10);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSort, setActiveSort] = useState("stock_value_desc");
  const [activeFilters, setActiveFilters] = useState({ unit: "all", waste: "all" });

  const { data: units = [] } = useQuery({
    queryKey: ["analytics", "ingredientUnits"],
    queryFn: getIngredientUnitsRequest,
    staleTime: 300000,
  });
  const unitOptions = [
    { value: "all", label: "All units" },
    ...units.map((u) => ({ value: u, label: u })),
  ];

  const filterActive =
    activeFilters.unit !== "all" ||
    activeFilters.waste !== "all" ||
    activeSort !== "stock_value_desc";

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "ingredientProfit", { dateFrom, dateTo, search, page, pageSize, sort: activeSort, filters: activeFilters }],
    queryFn: () => getIngredientProfitabilityRequest({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      search: search || undefined,
      sort: activeSort,
      waste: activeFilters.waste !== "all" ? activeFilters.waste : undefined,
      unit: activeFilters.unit !== "all" ? activeFilters.unit : undefined,
      limit: String(pageSize),
      page: String(page),
    }),
  });
  const rows = data?.data?.rows ?? [];
  const total = data?.data?.total ?? 0;

  function handleFilterApply(sort, filters) {
    setActiveSort(sort || "stock_value_desc");
    setActiveFilters({ unit: "all", waste: "all", ...filters });
    setPage(1);
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Ingredient Profitability</h3>
        <div className="w-64">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search ingredient..."
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
          { key: "unit", label: "Unit", options: unitOptions },
          { key: "waste", label: "Waste", options: WASTE_OPTIONS },
        ]}
        onApply={handleFilterApply}
        currentSort={activeSort}
        currentFilters={activeFilters}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead className="text-right">Stock Value</TableHead>
            <TableHead className="text-right">Restocks</TableHead>
            <TableHead className="text-right">Total Spend</TableHead>
            <TableHead className="text-right">Waste</TableHead>
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
                <TableCell className="text-right tabular-nums">{formatPeso(r.stock_value)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.restock_count}×</TableCell>
                <TableCell className="text-right tabular-nums text-amber-600">{formatPeso(r.total_spend)}</TableCell>
                <TableCell className="text-right tabular-nums text-red-500">{formatPeso(r.total_waste)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination currentPage={page} totalItems={total} pageSize={pageSize} pageSizeOptions={[10, 20, 50, 100]} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} itemLabel="ingredients" />
    </div>
  );
}
