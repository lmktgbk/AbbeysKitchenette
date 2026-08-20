import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIngredientsRequest, getArchivedIngredientsRequest } from "../api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/filters/SearchBar";
import { FilterPill } from "@/components/filters/FilterPill";
import { DropDown } from "@/components/filters/DropDown";
import { Skeleton } from "@/components/ui/skeleton";
import Icon from "@/components/ui/icon";
import { Pagination } from "@/components/filters/Pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const SORTABLE_COLUMNS = [
  { key: "ingredient_name", label: "Ingredient" },
  { key: "unit", label: "Unit" },
  { key: "stock_quantity", label: "Stock" },
  { key: "minimum_threshold", label: "Min Treshold" },
  { key: "status", label: "Status" },
];

function getStatusPriority(ingredient) {
  if (ingredient.stock_quantity === 0) return 0;
  if (ingredient.stock_quantity <= ingredient.minimum_threshold) return 1;
  return 2;
}

function sortIngredients(ingredients, sortKey, sortDir) {
  if (!sortKey) return ingredients;

  return [...ingredients].sort((a, b) => {
    let cmp;

    if (sortKey === "status") {
      cmp = getStatusPriority(a) - getStatusPriority(b);
    } else {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      cmp = typeof aVal === "string"
        ? aVal.localeCompare(bVal)
        : (aVal ?? 0) - (bVal ?? 0);
    }

    return sortDir === "desc" ? -cmp : cmp;
  });
}

export default function IngredientTable({
  onRestock,
  onLoss,
  onBatches,
  onArchive,
  onRestore,
  onDelete,
  onAdd,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  function toggleExpand(id) {
    setExpandedRow((prev) => (prev === id ? null : id));
  }

  const { data: ingredientsData, isLoading } = useQuery({
    queryKey: showArchived ? ["ingredients-archived"] : ["ingredients"],
    queryFn: showArchived ? getArchivedIngredientsRequest : getIngredientsRequest,
  });

  const filtered = useMemo(() => {
    const list = ingredientsData?.data?.ingredients ?? [];
    const result = list.filter((i) => {
      const matchesSearch = i.ingredient_name
        .toLowerCase()
        .includes(search.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === "out") matchesStatus = i.stock_quantity === 0;
      else if (statusFilter === "low")
        matchesStatus =
          i.stock_quantity > 0 && i.stock_quantity <= i.minimum_threshold;
      else if (statusFilter === "healthy")
        matchesStatus = i.stock_quantity > i.minimum_threshold;

      return matchesSearch && matchesStatus;
    });

    return sortIngredients(result, sortKey, sortDir);
  }, [ingredientsData, search, statusFilter, sortKey, sortDir]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, showArchived]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const hasData = ingredientsData?.data?.ingredients?.length > 0;
  const isRefetching = isLoading && hasData;

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="relative border border-border rounded-xl">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search ingredients..."
          />

          <DropDown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All Status" },
              { value: "out", label: "Out of Stock" },
              { value: "low", label: "Low Stock" },
              { value: "healthy", label: "Healthy" },
            ]}
            size="sm"
            className="w-36"
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterPill
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
            value={showArchived ? "archived" : "active"}
            onChange={(val) => setShowArchived(val === "archived")}
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
              {SORTABLE_COLUMNS.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-[10px] uppercase tracking-widest ${col.key === "stock_quantity" || col.key === "minimum_threshold" || col.key === "status"
                    ? "text-center"
                    : ""
                    }`}
                >
                  <button
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <Icon
                        name="chevronDown"
                        size={12}
                        className={`transition-transform ${sortDir === "desc" ? "rotate-180" : ""}`}
                      />
                    )}
                  </button>
                </TableHead>
              ))}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!hasData && isLoading ? (
              <SkeletonRows />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  {search || statusFilter !== "all"
                    ? "No ingredients match your filters."
                    : "No ingredients yet. Add your first ingredient to get started."}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((ingredient) => (
                <IngredientRow
                  key={ingredient.ingredient_id}
                  ingredient={ingredient}
                  isExpanded={expandedRow === ingredient.ingredient_id}
                  onToggleExpand={toggleExpand}
                  onRestock={onRestock}
                  onLoss={onLoss}
                  onBatches={onBatches}
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
        totalItems={filtered.length}
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
  if (stock === 0) stockColor = "text-red-600 dark:text-red-400";
  else if (stock <= threshold)
    stockColor = "text-yellow-600 dark:text-yellow-400";

  return (
    <>
      <TableRow className={rowBg} onClick={() => onToggleExpand(ingredient.ingredient_id)}>
        <TableCell className="font-medium">
          {ingredient.ingredient_name}
        </TableCell>
        <TableCell className="text-muted-foreground">{ingredient.unit}</TableCell>
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

const MOCK_CURRENT_BATCH = {
  batchNumber: 1,
  supplierName: "Supplier A",
  date: "2026-08-15T14:30:00",
  quantityAdded: 2000,
  quantityLeft: 800,
  costPerUnit: 1.50,
  notes: null,
};

function ExpandedRow({ ingredient, onRestock, onLoss, onBatches, onArchive, onRestore, onDelete, showArchived }) {
  const batch = MOCK_CURRENT_BATCH;
  const stock = ingredient.stock_quantity;
  const threshold = ingredient.minimum_threshold;
  const unit = ingredient.unit;

  const hasTransactions = ingredient.has_transactions ?? true;
  const isLinkedToProducts = ingredient.is_linked_to_products ?? true;

  let statusLabel = "Healthy";
  let statusVariant = "success";
  if (stock === 0) {
    statusLabel = "Out of Stock";
    statusVariant = "destructive";
  } else if (stock <= threshold) {
    statusLabel = "Low Stock";
    statusVariant = "warning";
  }

  const percentRemaining = batch.quantityAdded > 0
    ? Math.round((batch.quantityLeft / batch.quantityAdded) * 100)
    : 0;
  const batchTotalCost = batch.quantityLeft * batch.costPerUnit;

  const restockDate = new Date(batch.date);
  const dateStr = restockDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = restockDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

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
              <DetailRow label="Last Restock" value={dateStr} />
            </div>

            {/* Right — Current Batch + Actions */}
            <div className="w-full lg:w-2/3 space-y-5">
              {/* Current Batch */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Current Batch
                </p>
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <DetailRow label="Batch No." value={`#${batch.batchNumber}`} />
                  <DetailRow label="Stock Added" value={`${batch.quantityAdded.toLocaleString()} ${unit}`} />
                  <DetailRow
                    label="Remaining Stock"
                    value={`${batch.quantityLeft.toLocaleString()} ${unit} (${percentRemaining}%)`}
                  />
                  <DetailRow label="Cost per Unit" value={`₱${batch.costPerUnit.toFixed(2)}/${unit}`} />
                  <DetailRow
                    label="Total Cost"
                    value={`₱${batchTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  />
                  <DetailRow label="Supplier Name" value={batch.supplierName || "N/A"} />
                  <DetailRow label="Notes" value={batch.notes || "N/A"} />
                  <DetailRow label="Restock Date & Time" value={`${dateStr} · ${timeStr}`} />
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  Actions
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {showArchived ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onRestore(ingredient)} className="text-green-600 border-green-600/30 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:border-green-400/30 dark:hover:bg-green-500/10">
                        <Icon name="package" size={14} />
                        Restore
                      </Button>
                      {!hasTransactions && (
                        <Button size="sm" variant="outline" onClick={() => onDelete(ingredient)} className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                          <Icon name="x" size={14} />
                          Delete
                        </Button>
                      )}
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
                      {!hasTransactions && !isLinkedToProducts && (
                        <Button size="sm" variant="outline" onClick={() => onDelete(ingredient)} className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                          <Icon name="x" size={14} />
                          Delete
                        </Button>
                      )}
                      {hasTransactions && !isLinkedToProducts && (
                        <Button size="sm" variant="outline" onClick={() => onArchive(ingredient)} className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                          <Icon name="settings" size={14} />
                          Archive
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

/* ── Detail Row ──────────────────── */

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
