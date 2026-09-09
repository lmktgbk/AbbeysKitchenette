import { useState } from "react";
import { useIngredientTable, useIngredientBatches } from "../query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/filters/SearchBar";
import { FilterPill } from "@/components/filters/FilterPill";
import FilterModal from "@/components/filters/FilterModal";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";
import PrimarySpinner from "@/components/ui/spinner";
import { Pagination } from "@/components/filters/Pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/date";

const INGREDIENT_SORT_OPTIONS = [
  { value: "status_asc", label: "Status: Healthy first" },
  { value: "status_desc", label: "Status: Out of stock first" },
  { value: "ingredient_name_asc", label: "Name A-Z" },
  { value: "ingredient_name_desc", label: "Name Z-A" },
  { value: "stock_quantity_asc", label: "Stock: Low → High" },
  { value: "stock_quantity_desc", label: "Stock: High → Low" },
  { value: "minimum_threshold_asc", label: "Threshold: Low → High" },
  { value: "minimum_threshold_desc", label: "Threshold: High → Low" },
];

const ARCHIVED_SORT_OPTIONS = [
  { value: "ingredient_name_asc", label: "Name A-Z" },
  { value: "ingredient_name_desc", label: "Name Z-A" },
  { value: "stock_quantity_asc", label: "Stock: Low → High" },
  { value: "stock_quantity_desc", label: "Stock: High → Low" },
  { value: "minimum_threshold_asc", label: "Threshold: Low → High" },
  { value: "minimum_threshold_desc", label: "Threshold: High → Low" },
];

const INGREDIENT_FILTER_OPTIONS = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "all", label: "All" },
      { value: "healthy", label: "Healthy" },
      { value: "low", label: "Low Stock" },
      { value: "out", label: "Out of Stock" },
    ],
  },
];

const INGREDIENT_COLUMNS = [
  { key: "ingredient_name", label: "Ingredient" },
  { key: "unit", label: "Unit" },
  { key: "stock_quantity", label: "Stock" },
  { key: "minimum_threshold", label: "Min Threshold" },
  { key: "status", label: "Status" },
];

export default function IngredientTable({
  onRestock,
  onLoss,
  onBatches,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onAdd,
}) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeSort, setActiveSort] = useState("status_asc");
  const [activeFilters, setActiveFilters] = useState({ status: "all" });

  function toggleExpand(id) {
    setExpandedRow((prev) => (prev === id ? null : id));
  }

  // Parse sort value into sortBy + sortDir
  const [sortBy, sortDir] = activeSort.includes("_desc")
    ? [activeSort.replace("_desc", ""), "desc"]
    : [activeSort.replace("_asc", ""), "asc"];

  const queryParams = {
    page: currentPage,
    limit: pageSize,
    search: search || undefined,
    status: activeFilters.status !== "all" ? activeFilters.status : undefined,
    sortBy,
    sortDir,
  };

  const { data: ingredientsData, isLoading } = useIngredientTable(queryParams, showArchived);

  const ingredients = ingredientsData?.data?.ingredients ?? [];
  const totalItems = ingredientsData?.data?.totalItems ?? 0;

  const hasData = totalItems > 0;
  const isRefetching = isLoading && hasData;

  function handleFilterApply(sort, filters) {
    setCurrentPage(1);
    setActiveSort(sort);
    setActiveFilters(filters);
  }

  const filterActive = activeFilters.status !== "all" || activeSort !== "status_asc";

  return (
    <div className="relative border border-border rounded-xl">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SearchBar
            value={search}
            onChange={(val) => { setSearch(val); setCurrentPage(1); }}
            placeholder="Search ingredients..."
            onFilterClick={() => setFilterOpen(true)}
            filterActive={filterActive}
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterPill
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
            value={showArchived ? "archived" : "active"}
            onChange={(val) => {
              const archived = val === "archived";
              setShowArchived(archived);
              setCurrentPage(1);
              setActiveSort(archived ? "ingredient_name_asc" : "status_asc");
            }}
          />

          <Button
            size="sm"
            onClick={onAdd}
            disabled={showArchived}
          >
            <Icon name="package" size={14} />
            <span className="hidden sm:inline">Add Ingredient</span>
          </Button>
        </div>
      </div>

      <FilterModal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        sortOptions={showArchived ? ARCHIVED_SORT_OPTIONS : INGREDIENT_SORT_OPTIONS}
        filterOptions={showArchived ? [] : INGREDIENT_FILTER_OPTIONS}
        onApply={handleFilterApply}
        currentSort={activeSort}
        currentFilters={activeFilters}
      />

      {/* Table */}
      <div className={`relative ${isRefetching ? "pointer-events-none" : ""}`}>
        {isRefetching && (
          <div className="absolute inset-0 z-10 bg-background/60 flex items-start justify-center pt-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        <Table noOverflow>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {INGREDIENT_COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-[10px] uppercase tracking-widest ${col.key === "unit" ||
                    col.key === "stock_quantity" ||
                    col.key === "minimum_threshold" ||
                    col.key === "status"
                    ? "text-center"
                    : ""
                    }`}
                >
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && !hasData ? (
              <SkeletonRows />
            ) : ingredients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {showArchived
                    ? "No archived ingredients."
                    : search || activeFilters.status !== "all"
                      ? "No ingredients match your filters."
                      : "No ingredients yet. Add your first ingredient to get started."}
                </TableCell>
              </TableRow>
            ) : (
              ingredients.map((ingredient) => (
                <IngredientRow
                  key={ingredient.ingredient_id}
                  ingredient={ingredient}
                  isExpanded={expandedRow === ingredient.ingredient_id}
                  onToggleExpand={toggleExpand}
                  onRestock={onRestock}
                  onLoss={onLoss}
                  onBatches={onBatches}
                  onEdit={onEdit}
                  onArchive={onArchive}
                  onRestore={onRestore}
                  onDelete={onDelete}
                  showArchived={showArchived}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer */}
      <Pagination
        currentPage={currentPage}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(1);
        }}
        itemLabel="ingredients"
      />
    </div>
  );
}

/* ── Skeleton Rows ───────────────────── */

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
          <TableCell className="text-center"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
          <TableCell className="text-center"><Skeleton className="h-5 w-16 mx-auto rounded-full" /></TableCell>
          <TableCell className="text-center"><Skeleton className="h-6 w-6 mx-auto rounded" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

/* ── Ingredient Row ──────────────────── */

function IngredientRow({
  ingredient,
  isExpanded,
  onToggleExpand,
  onRestock,
  onLoss,
  onBatches,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
}) {
  const stock = ingredient.stock_quantity;
  const threshold = ingredient.minimum_threshold;

  let statusLabel = "Healthy";
  let statusVariant = "success";
  let rowBg = "";

  if (stock === 0) {
    statusLabel = "Out of Stock";
    statusVariant = "destructive";
    rowBg = "bg-red-500/5 dark:bg-red-500/5";
  } else if (stock <= threshold) {
    statusLabel = "Low Stock";
    statusVariant = "warning";
    rowBg = "bg-yellow-500/5 dark:bg-yellow-500/5";
  }

  if (isExpanded) {
    rowBg = "bg-muted/30";
  }

  let stockColor = "text-foreground";
  if (stock === 0) stockColor = "text-destructive";
  else if (stock <= threshold)
    stockColor = "text-warning";

  return (
    <>
      <TableRow className={rowBg} onClick={() => onToggleExpand(ingredient.ingredient_id)}>
        <TableCell className="font-medium">
          {ingredient.ingredient_name}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">{ingredient.unit}</TableCell>
        <TableCell className={`text-center font-mono font-semibold ${stockColor}`}>
          {stock.toLocaleString()}
        </TableCell>
        <TableCell className="text-center font-mono text-muted-foreground">
          {threshold.toLocaleString()}
        </TableCell>
        <TableCell className="text-center">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </TableCell>
        <TableCell className="text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(ingredient.ingredient_id);
            }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon
              name="chevronDown"
              size={16}
              className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <ExpandedRow
          ingredient={ingredient}
          onRestock={onRestock}
          onLoss={onLoss}
          onBatches={onBatches}
          onEdit={onEdit}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          showArchived={showArchived}
        />
      )}
    </>
  );
}

/* ── Expanded Row ──────────────────── */

function ExpandedRow({ ingredient, onRestock, onLoss, onBatches, onEdit, onArchive, onRestore, onDelete, showArchived }) {
  const { data: batchesData, isLoading } = useIngredientBatches(ingredient.ingredient_id);

  const batches = batchesData?.data?.batches ?? [];
  const activeBatch = batches.find((b) => b.quantity_left > 0) ?? null;

  const stock = ingredient.stock_quantity;
  const threshold = ingredient.minimum_threshold;
  const unit = ingredient.unit;

  let statusLabel = "Healthy";
  let statusVariant = "success";
  if (stock === 0) {
    statusLabel = "Out of Stock";
    statusVariant = "destructive";
  } else if (stock <= threshold) {
    statusLabel = "Low Stock";
    statusVariant = "warning";
  }

  const lastRestockStr = activeBatch
    ? formatDate(activeBatch.restocked_at)
    : "N/A";

  if (isLoading) {
    return (
      <TableRow className="bg-muted/20">
        <TableCell colSpan={6} className="p-0">
          <div className="px-6 py-8 flex justify-center">
            <PrimarySpinner size="sm" />
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-muted/20">
      <TableCell colSpan={6} className="p-0">
        <div className="px-6 py-5 border-l-2 border-primary ml-4 my-2 rounded-r-lg">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left — Summary */}
            <div className="w-full lg:w-1/3 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Summary
              </p>
              <DetailRow label="Total Stock" value={`${stock.toLocaleString()} ${unit}`} />
              <DetailRow label="Unit" value={unit} />
              <DetailRow label="Min Threshold" value={`${threshold.toLocaleString()} ${unit}`} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
              </div>
              <DetailRow label="Last Restock" value={lastRestockStr} />
            </div>

            {/* Right — Current Batch */}
            <div className="w-full lg:w-2/3">
              {activeBatch ? (
                <CurrentBatch batch={activeBatch} unit={unit} />
              ) : (
                <div className="rounded-lg border border-border p-4 text-center">
                  <Icon name="package" size={20} className="mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No restock batches yet.
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Click <span className="font-medium text-foreground">Restock</span> to add inventory.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions — full width below both columns */}
          <div className="border-t border-border pt-4 mt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Actions
            </p>
            <div className="flex flex-wrap gap-2">
              {showArchived ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => onRestore(ingredient)} className="text-success border-success/30 hover:bg-success/10 hover:text-success">
                    <Icon name="package" size={14} />
                    Restore
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onDelete(ingredient)} className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                    <Icon name="x" size={14} />
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => onRestock(ingredient)}>
                    <Icon name="package" size={14} />
                    Restock
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onLoss(ingredient)}>
                    <Icon name="x" size={14} />
                    Loss
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onBatches(ingredient)}>
                    <Icon name="warehouse" size={14} />
                    Batches
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEdit(ingredient)}>
                    <Icon name="edit" size={14} />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onArchive(ingredient)}>
                    <Icon name="archive" size={14} />
                    Archive
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onDelete(ingredient)} className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                    <Icon name="x" size={14} />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ── Current Batch ──────────────────── */

function CurrentBatch({ batch, unit }) {
  const percentRemaining = batch.quantity_added > 0
    ? Math.round((batch.quantity_left / batch.quantity_added) * 100)
    : 0;

  const batchTotalCost = batch.quantity_left * batch.cost_per_unit;

  const restockDate = new Date(batch.restocked_at);
  const dateStr = formatDate(restockDate);
  const timeStr = formatTime(restockDate);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        Current Batch #{batch.batch_id}
      </p>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <DetailRow label="Stock Added" value={`${batch.quantity_added.toLocaleString()} ${unit}`} />
        <DetailRow
          label="Remaining Stock"
          value={`${batch.quantity_left.toLocaleString()} ${unit} (${percentRemaining}%)`}
        />
        <DetailRow label="Cost per Unit" value={`₱${batch.cost_per_unit.toFixed(2)}/${unit}`} />
        <DetailRow
          label="Total Cost"
          value={`₱${batchTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <DetailRow label="Supplier Name" value={batch.supplier_name || "N/A"} />
        <DetailRow label="Notes" value={batch.notes || "N/A"} />
        <DetailRow label="Restock Date & Time" value={`${dateStr} · ${timeStr}`} />
      </div>
    </div>
  );
}

/* ── Detail Row ──────────────────── */

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}
