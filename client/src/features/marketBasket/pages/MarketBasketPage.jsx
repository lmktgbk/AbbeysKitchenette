import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { useLatestMBAJob } from "../query";
import MarketBasketRunButton from "../components/MarketBasketRunButton";
import ComboCard from "../components/ComboCard";
import CreateComboModal from "../components/CreateComboModal";

const PAGE_SIZE_OPTIONS = [9, 12, 18];

/**
 * MarketBasketPage
 *
 * Main page for Market Basket Analytics.
 * Runs FP-Growth analysis on order history to find product associations.
 * Results are persisted in the database and survive page reloads.
 */
export default function MarketBasketPage() {
  const { job, isLoading: jobLoading } = useLatestMBAJob();
  const [showComboModal, setShowComboModal] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const rules = job?.rules ?? [];
  const isRunning = job?.status === "running";
  const isFailed = job?.status === "failed";

  // Compute stats
  const avgConfidence = rules.length > 0
    ? rules.reduce((sum, r) => sum + r.confidence, 0) / rules.length
    : 0;
  const topPair = job?.top_pair || "\u2014";
  const combosFound = job?.combos_found ?? 0;

  // Filter rules by search
  const filteredRules = rules.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const nameA = `${r.product_a} ${r.size_name_a || ""}`.toLowerCase();
    const nameB = `${r.product_b} ${r.size_name_b || ""}`.toLowerCase();
    return nameA.includes(q) || nameB.includes(q);
  });

  // Paginate
  const totalPages = Math.ceil(filteredRules.length / pageSize);
  const paginatedRules = filteredRules.slice((page - 1) * pageSize, page * pageSize);

  function handleCreateCombo(combo) {
    setSelectedCombo(combo);
    setShowComboModal(true);
  }

  function handleSearchChange(value) {
    setSearch(value);
    setPage(1);
  }

  const isLoading = jobLoading;
  const hasResults = rules.length > 0 && !isRunning;
  const isEmpty = !hasResults && !isLoading && !isFailed && !isRunning;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Combos Found
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {isLoading ? <Skeleton className="h-6 w-12" /> : combosFound}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Avg Confidence
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {isLoading ? <Skeleton className="h-6 w-12" /> : rules.length > 0 ? `${(avgConfidence * 100).toFixed(0)}%` : "\u2014"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top Pair
          </p>
          <p className="mt-1 text-sm font-bold text-foreground line-clamp-2">
            {isLoading ? <Skeleton className="h-6 w-24" /> : topPair}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Orders Analyzed
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {isLoading ? <Skeleton className="h-6 w-12" /> : job?.total_orders ?? "\u2014"}
          </p>
        </div>
      </div>

      {/* Toolbar: SearchBar + Run Button */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <SearchBar
            value={search}
            onChange={handleSearchChange}
            placeholder="Search products..."
          />
        </div>
        <MarketBasketRunButton />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-border p-4">
              <Skeleton className="mb-2 h-4 w-48" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-3 h-16 w-full" />
              <Skeleton className="mt-3 h-8 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Running skeleton */}
      {isRunning && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-border p-4">
              <Skeleton className="mb-2 h-4 w-48" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-3/4" />
              <Skeleton className="mt-3 h-16 w-full" />
              <Skeleton className="mt-3 h-8 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Failed State */}
      {isFailed && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center">
          <p className="text-sm text-destructive">
            Analysis failed: {job?.error_message || "Unknown error"}
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && !isLoading && (
        <>
          {filteredRules.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-8 text-center">
              <Icon name="shoppingBag" size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? "No associations match your search." : "No associations found. Try lowering the match threshold."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {paginatedRules.map((rule) => (
                  <ComboCard
                    key={rule.id}
                    rule={rule}
                    onCreateCombo={handleCreateCombo}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={page}
                  totalItems={filteredRules.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  itemLabel="associations"
                />
              )}
            </>
          )}
        </>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
          <Icon name="shoppingBag" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Discover which products are frequently ordered together.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Click{" "}
            <Icon name="sparkles" size={10} className="inline" /> to run FP-Growth analysis
            on your order history.
          </p>
        </div>
      )}

      {/* Create Combo Modal */}
      <CreateComboModal
        key={selectedCombo?.id ?? "none"}
        open={showComboModal}
        onOpenChange={setShowComboModal}
        combo={selectedCombo}
      />
    </div>
  );
}
