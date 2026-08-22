import { useState } from "react";
import { useIngredientBatches, useIngredientHistory, useIngredientMutations } from "../query";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import PrimarySpinner from "@/components/ui/spinner";
import { SearchBar } from "@/components/filters/SearchBar";
import { FilterPill } from "@/components/filters/FilterPill";
import FilterModal from "@/components/filters/FilterModal";
import { Pagination } from "@/components/filters/Pagination";
import { formatDate } from "@/lib/date";
import { toast } from "sonner";

/**
 * BatchListModal
 *
 * Modal dialog showing restock batches and adjustment history for an ingredient.
 * Uses server-side pagination for both tabs — no client-side fetch-all.
 *
 * FIFO logic:
 * - Default: natural FIFO (oldest batch first)
 * - Star a batch: that batch is used first. When it empties, FIFO resumes from oldest remaining.
 * - Only ONE batch can be starred at a time (single-star rule).
 * - "Follow FIFO" button clears all stars, returning to natural FIFO.
 *
 * Props:
 * - open: boolean
 * - onOpenChange: (open: boolean) => void
 * - ingredient: object
 */

const BATCH_SORT_OPTIONS = [
  { value: "fifo", label: "FIFO (oldest first)" },
  { value: "restocked_at_desc", label: "Date: Newest first" },
  { value: "quantity_left_desc", label: "Remaining: Most → Least" },
  { value: "quantity_left_asc", label: "Remaining: Least → Most" },
  { value: "cost_per_unit_asc", label: "Cost/Unit: Low → High" },
  { value: "cost_per_unit_desc", label: "Cost/Unit: High → Low" },
  { value: "total_cost_asc", label: "Total Cost: Low → High" },
  { value: "total_cost_desc", label: "Total Cost: High → Low" },
];

const HISTORY_SORT_OPTIONS = [
  { value: "adjustedAt_desc", label: "Date: Newest first" },
  { value: "adjustedAt_asc", label: "Date: Oldest first" },
];

const HISTORY_FILTER_OPTIONS = [
  {
    key: "type",
    label: "Type",
    options: [
      { value: "all", label: "All Types" },
      { value: "restock", label: "Restock" },
      { value: "loss", label: "Loss" },
      { value: "manual", label: "Manual" },
      { value: "deduction", label: "Deduction" },
    ],
  },
];

export default function BatchListModal({ open, onOpenChange, ingredient }) {
  const mutations = useIngredientMutations();
  const [activeTab, setActiveTab] = useState("batches");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Batches sort/filter state
  const [activeBatchSort, setActiveBatchSort] = useState("fifo");
  const [activeBatchFilters] = useState({});

  // History sort/filter state
  const [activeHistorySort, setActiveHistorySort] = useState("adjustedAt_desc");
  const [activeHistoryFilters, setActiveHistoryFilters] = useState({ type: "all" });

  // Batches pagination state
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize, setBatchPageSize] = useState(50);

  // History pagination state
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(50);

  // Parse batch sort into sortBy + sortDir
  const [batchSortBy, batchSortDir] = activeBatchSort === "fifo"
    ? ["restocked_at", "asc"]
    : activeBatchSort.includes("_desc")
      ? [activeBatchSort.replace("_desc", ""), "desc"]
      : [activeBatchSort.replace("_asc", ""), "asc"];

  // Parse history sort into sortBy + sortDir
  const [historySortBy, historySortDir] = activeHistorySort.includes("_desc")
    ? [activeHistorySort.replace("_desc", ""), "desc"]
    : [activeHistorySort.replace("_asc", ""), "asc"];

  // Build batch query params — sent to backend on every change
  const batchQueryParams = {
    page: batchPage,
    limit: batchPageSize,
    search: search || undefined,
    sortBy: batchSortBy,
    sortDir: batchSortDir,
  };

  // Fetch batches from server with pagination
  const { data: batchesData, isLoading: batchesLoading } = useIngredientBatches(
    ingredient?.ingredient_id,
    batchQueryParams,
    { enabled: open && !!ingredient?.ingredient_id && activeTab === "batches" },
  );

  // Build history query params — sent to backend on every change
  const historyQueryParams = {
    page: historyPage,
    limit: historyPageSize,
    search: search || undefined,
    sortBy: historySortBy,
    sortDir: historySortDir,
    type: activeHistoryFilters.type !== "all" ? activeHistoryFilters.type : undefined,
  };

  // Fetch history from server with pagination, search, and type filter
  const { data: historyData, isLoading: historyLoading } = useIngredientHistory(
    ingredient?.ingredient_id,
    historyQueryParams,
    { enabled: open && !!ingredient?.ingredient_id && activeTab === "history" },
  );

  const priorityMutation = {
    mutate: ({ batchId, isPriority }) =>
      mutations.togglePriority.mutate(
        { ingredientId: ingredient?.ingredient_id, batchId, isPriority },
        {
          onSuccess: () => toast.success("Batch priority updated"),
          onError: (err) => toast.error(err.response?.data?.message || "Failed to update priority"),
        },
      ),
    isPending: mutations.togglePriority.isPending,
  };

  const followFifoMutation = {
    mutate: () =>
      mutations.followFifo.mutate(ingredient?.ingredient_id, {
        onSuccess: () => toast.success("FIFO order restored"),
        onError: (err) => toast.error(err.response?.data?.message || "Failed to restore FIFO"),
      }),
    isPending: mutations.followFifo.isPending,
  };

  // Server returns { batches, totalItems, hasPriority, fifoLeaderBatchId }
  const batches = batchesData?.data?.batches ?? [];
  const totalBatches = batchesData?.data?.totalItems ?? 0;
  const hasPriority = batchesData?.data?.hasPriority ?? false;
  const fifoLeaderBatchId = batchesData?.data?.fifoLeaderBatchId ?? null;

  // Derive FIFO vs manual mode: FIFO mode when priority batch IS the FIFO leader
  const priorityBatch = batches.find((b) => b.is_priority);
  const isFifoMode = priorityBatch
    ? priorityBatch.batch_id === fifoLeaderBatchId
    : !fifoLeaderBatchId; // no priority batch and no leader = no batches at all

  // Server returns { history, totalItems }
  const history = historyData?.data?.history ?? [];
  const totalHistory = historyData?.data?.totalItems ?? 0;

  if (!ingredient) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Batches & History
            </h3>
            <p className="text-sm text-muted-foreground">
              {ingredient.ingredient_name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FilterPill
              options={[
                { value: "batches", label: "Batches" },
                { value: "history", label: "History" },
              ]}
              value={activeTab}
              onChange={(val) => {
                setActiveTab(val);
                setSearch("");
                // Only reset the target tab's page — keep sort/filter persistent per tab
                if (val === "batches") {
                  setBatchPage(1);
                } else {
                  setHistoryPage(1);
                }
              }}
            />
            <DialogClose onClick={() => onOpenChange(false)} className="static" />
          </div>
        </div>

        {/* Toolbar: Search + Filter | Follow FIFO */}
        <div className="flex items-center justify-between px-6 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <SearchBar
              value={search}
              onChange={(val) => {
                setSearch(val);
                setBatchPage(1);
                setHistoryPage(1);
              }}
              placeholder={activeTab === "batches" ? "Search batches..." : "Search history..."}
              className="w-56"
              onFilterClick={() => setFilterOpen(true)}
              filterActive={activeTab === "batches"
                ? activeBatchSort !== "fifo"
                : activeHistorySort !== "adjustedAt_desc" || activeHistoryFilters.type !== "all"
              }
            />
          </div>

          <div className="flex items-center gap-2">
            {activeTab === "batches" && totalBatches > 0 && (
              <button
                onClick={() => followFifoMutation.mutate()}
                disabled={followFifoMutation.isPending || isFifoMode}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${isFifoMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  } ${followFifoMutation.isPending ? "opacity-50" : ""}`}
              >
                <Icon name="arrowDown" size={12} />
                Following FIFO
              </button>
            )}
          </div>
        </div>

        {/* Filter Modal */}
        <FilterModal
          open={filterOpen}
          onOpenChange={setFilterOpen}
          sortOptions={activeTab === "batches" ? BATCH_SORT_OPTIONS : HISTORY_SORT_OPTIONS}
          filterOptions={activeTab === "history" ? HISTORY_FILTER_OPTIONS : []}
          onApply={(sort, filters) => {
            if (activeTab === "batches") {
              setActiveBatchSort(sort);
            } else {
              setActiveHistorySort(sort);
              setActiveHistoryFilters(filters);
            }
            setBatchPage(1);
            setHistoryPage(1);
          }}
          currentSort={activeTab === "batches" ? activeBatchSort : activeHistorySort}
          currentFilters={activeTab === "history" ? activeHistoryFilters : {}}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {activeTab === "batches" ? (
            <BatchesTab
              batches={batches}
              isLoading={batchesLoading}
              ingredient={ingredient}
              fifoLeaderBatchId={fifoLeaderBatchId}
              onTogglePriority={(batchId, isPriority) =>
                priorityMutation.mutate({ batchId, isPriority })
              }
              isPriorityLoading={priorityMutation.isPending}
            />
          ) : (
            <HistoryTab
              history={history}
              isLoading={historyLoading}
              unit={ingredient.unit}
            />
          )}
        </div>

        {/* Pagination — fixed at bottom */}
        {activeTab === "batches" ? (
          <Pagination
            currentPage={batchPage}
            totalItems={totalBatches}
            pageSize={batchPageSize}
            onPageChange={setBatchPage}
            onPageSizeChange={(size) => { setBatchPageSize(size); setBatchPage(1); }}
            itemLabel="batches"
          />
        ) : (
          <Pagination
            currentPage={historyPage}
            totalItems={totalHistory}
            pageSize={historyPageSize}
            onPageChange={setHistoryPage}
            onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }}
            itemLabel="entries"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Batches Tab ───────────────────── */

function BatchesTab({ batches, isLoading, ingredient, fifoLeaderBatchId, onTogglePriority, isPriorityLoading }) {
  const unit = ingredient.unit;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <PrimarySpinner size="sm" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground text-sm">
        No restock batches recorded yet.
      </p>
    );
  }

  return (
    <Table noOverflow>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-12"></TableHead>
          <TableHead className="w-20 text-center">ID</TableHead>
          <TableHead className="w-24 text-center">Date</TableHead>
          <TableHead className="w-24 text-center">Added</TableHead>
          <TableHead className="w-28 text-center">Remaining</TableHead>
          <TableHead className="w-28 text-center">Cost/Unit</TableHead>
          <TableHead className="w-28 text-center">Total</TableHead>
          <TableHead>Supplier</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => (
          <BatchRow
            key={batch.batch_id}
            batch={batch}
            ingredient={ingredient}
            onTogglePriority={onTogglePriority}
            isPriorityLoading={isPriorityLoading}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/* ── Batch Row ─────────────────────── */

function BatchRow({ batch, ingredient, onTogglePriority, isPriorityLoading }) {
  const unit = ingredient.unit;
  const remaining = batch.quantity_left;
  const isDepleted = remaining === 0;

  const restockDate = new Date(batch.restocked_at);
  const dateStr = formatDate(restockDate);

  const isStarHighlighted = batch.is_priority;

  return (
    <TableRow
      className={
        `${batch.is_priority ? "bg-primary/5" : ""} ${isDepleted ? "opacity-50" : ""}`
      }
    >
      {/* Star */}
      <TableCell className="w-12 px-3">
        <button
          onClick={() => onTogglePriority(batch.batch_id, !batch.is_priority)}
          disabled={isPriorityLoading}
          className={`w-8 h-8 shrink-0 rounded-md flex items-center justify-center text-sm transition-colors ${isStarHighlighted
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
            } ${isPriorityLoading ? "opacity-50" : "cursor-pointer"}`}
          title={batch.is_priority ? "Remove priority" : "Use first (priority)"}
        >
          {isStarHighlighted ? "★" : "☆"}
        </button>
      </TableCell>

      {/* ID */}
      <TableCell className="w-20 font-mono text-muted-foreground text-xs text-center">
        B-{batch.batch_id}
      </TableCell>

      {/* Date */}
      <TableCell className="w-24 text-muted-foreground text-center">
        {dateStr}
      </TableCell>

      {/* Added */}
      <TableCell className="w-24 text-center font-mono whitespace-nowrap">
        {batch.quantity_added.toLocaleString()} {unit}
      </TableCell>

      {/* Remaining */}
      <TableCell className={`w-28 text-center font-mono font-medium whitespace-nowrap ${isDepleted
        ? "text-muted-foreground"
        : "text-green-600 dark:text-green-400"
        }`}>
        {remaining.toLocaleString()} {unit}
      </TableCell>

      {/* Cost per Unit */}
      <TableCell className="w-28 text-center font-mono text-muted-foreground whitespace-nowrap">
        ₱{batch.cost_per_unit.toFixed(2)}/{unit}
      </TableCell>

      {/* Total Cost */}
      <TableCell className="w-28 text-center font-mono whitespace-nowrap">
        ₱{batch.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </TableCell>

      {/* Supplier */}
      <TableCell className="truncate max-w-[120px]" title={batch.supplier_name || undefined}>
        {batch.supplier_name || "—"}
      </TableCell>

      {/* Notes icon */}
      <TableCell className="w-10 px-3 text-center">
        {batch.notes ? (
          <span className="group relative inline-flex items-center justify-center">
            <Icon
              name="fileText"
              size={14}
              className="text-muted-foreground cursor-help"
            />
            <span className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-56 p-2.5 text-xs text-foreground bg-popover border border-border rounded-lg z-50 leading-relaxed">
              {batch.notes}
            </span>
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/* ── History Tab ───────────────────── */

function HistoryTab({ history, isLoading, unit }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <PrimarySpinner size="sm" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground text-sm">
        No adjustment history yet.
      </p>
    );
  }

  return (
    <div className="px-6 py-4">
      <div className="relative">
        {/* Timeline vertical line */}
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />

        <div className="divide-y divide-border">
          {history.map((entry) => (
            <HistoryRow key={entry.adjustment_id} entry={entry} unit={unit} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Type config for icons and colors ───────────────── */

const TYPE_CONFIG = {
  restock: {
    icon: "package",
    badge: "success",
    dot: "bg-green-500",
  },
  loss: {
    icon: "x",
    badge: "destructive",
    dot: "bg-red-500",
  },
  manual: {
    icon: "edit",
    badge: "default",
    dot: "bg-blue-500",
  },
  deduction: {
    icon: "minus",
    badge: "destructive",
    dot: "bg-orange-500",
  },
};

function HistoryRow({ entry, unit }) {
  const config = TYPE_CONFIG[entry.adjustment_type] || TYPE_CONFIG.manual;
  const isPositive = entry.quantity_changed > 0;

  return (
    <div className="relative flex items-start gap-4 py-3 pl-0">
      {/* Timeline dot */}
      <div className="relative z-10 mt-1.5 flex h-[10px] w-[10px] shrink-0 items-center justify-center">
        <span className={`block h-2.5 w-2.5 rounded-full ${config.dot}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top row: Badge + quantity (left) | who + when (right) */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Badge variant={config.badge} className="flex items-center gap-1 shrink-0">
              <Icon name={config.icon} size={10} />
              {entry.adjustment_type}
            </Badge>
            <span
              className={`text-sm font-medium whitespace-nowrap ${isPositive
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
                }`}
            >
              {isPositive ? "+" : ""}
              {entry.quantity_changed.toLocaleString()} {unit}
            </span>
            <span className="text-muted-foreground text-xs">→</span>
            <span className="text-sm font-medium whitespace-nowrap">
              {entry.quantity_after.toLocaleString()} {unit}
            </span>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
            {entry.adjusted_by} · {formatDate(entry.adjusted_at)}
          </span>
        </div>

        {/* Notes: full width below */}
        {entry.notes && (
          <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
            {entry.notes}
          </div>
        )}
      </div>
    </div>
  );
}
