/**
 * MarketBasketPage — promotions inbox from the latest market-basket job + combo creation.
 * WHY it exists: turns association rules into add-to-products promos admins can act on.
 * Query keys consumed: ["marketBasket","jobs"] via useLatestMBAJob. Guards: admin-only
 * route; no BR-02 shift gate.
 * State: Query [job] | local [showComboModal, selectedCombo] | Zustand [].
 */
import { useState, useMemo, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/filters/Pagination";
import { useLatestMBAJob } from "../query";
import MarketBasketRunButton from "../components/MarketBasketRunButton";
import ComboCard from "../components/ComboCard";
import CreateComboModal from "../components/CreateComboModal";

export default function MarketBasketPage() {
  const { job, isLoading: jobLoading } = useLatestMBAJob();
  const [showComboModal, setShowComboModal] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState(null);
  // Combo grid paging (client-side: rules payload is bounded by topN).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const rules = job?.rules ?? [];
  const isRunning = job?.status === "running";
  const isFailed = job?.status === "failed";

  // Reset to first page whenever a new analysis job arrives
  // (render-adjust pattern — no set-state-in-effect).
  const [prevJobId, setPrevJobId] = useState(job?.id);
  if (job?.id !== prevJobId) {
    setPrevJobId(job?.id);
    setPage(1);
  }

  const topRule = useMemo(() => {
    if (!rules.length) return null;
    const sorted = [...rules].sort((a,b) => (b.score ?? b.confidence*b.lift) - (a.score ?? a.confidence*a.lift));
    return sorted[0];
  }, [rules]);
  const topPromotion = topRule ? `${topRule.product_a} + ${topRule.product_b}` : "—";
  const combosFound = job?.combos_found ?? 0;
  const lastUpdated = job?.completed_at ? new Date(job.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  const handleCreateCombo = useCallback((combo) => {
    setSelectedCombo(combo);
    setShowComboModal(true);
  }, []);

  const handleAddTop = useCallback(() => {
    if (topRule) handleCreateCombo(topRule);
  }, [topRule, handleCreateCombo]);

  const isLoading = jobLoading;
  const hasResults = rules.length > 0 && !isRunning;
  const isEmpty = !hasResults && !isLoading && !isFailed && !isRunning;

  // Page window over the combo grid (global index preserved for isTop).
  // Plain slice — O(n) trivial, no memo needed.
  const startIdx = (page - 1) * pageSize;
  const visibleRules = rules.slice(startIdx, startIdx + pageSize);

  return (
    <div className="flex flex-col gap-4">
      {/* Top Promotion — merged header (no separate Promotions card) */}
      {hasResults || isLoading ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Top Promotion to Try</p>
              <p className="mt-1 text-lg font-bold text-foreground">{isLoading ? <Skeleton className="h-6 w-48" /> : topPromotion}</p>
              <p className="mt-1 text-xs text-muted-foreground">{isLoading ? <Skeleton className="h-4 w-32" /> : `${combosFound} promotions found — this one is the best to start with`}</p>
            </div>
            {hasResults && topRule && (
              <Button size="sm" onClick={handleAddTop} className="shrink-0 whitespace-nowrap">
                <Icon name="plus" size={14} className="mr-1" />
                Add to Products
              </Button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{lastUpdated ? `Last updated: ${lastUpdated}` : "Ready to analyze"}</span>
            <span>·</span>
            <MarketBasketRunButton compact />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-base font-semibold text-foreground">Promotions</h1>
              <p className="mt-1 text-xs text-muted-foreground">Find the best product pairs to promote</p>
            </div>
            <div className="shrink-0">
              <MarketBasketRunButton />
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-border p-4">
              <Skeleton className="mb-2 h-4 w-48" />
              <div className="flex gap-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-16" /></div>
              <Skeleton className="mt-3 h-3 w-full" /><Skeleton className="mt-2 h-3 w-3/4" /><Skeleton className="mt-3 h-16 w-full" /><Skeleton className="mt-3 h-8 w-full" />
            </div>
          ))}
        </div>
      )}

      {isRunning && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-xl border border-border p-4">
              <Skeleton className="mb-2 h-4 w-48" /><div className="flex gap-2"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-16" /></div><Skeleton className="mt-3 h-3 w-full" /><Skeleton className="mt-2 h-3 w-3/4" /><Skeleton className="mt-3 h-16 w-full" /><Skeleton className="mt-3 h-8 w-full" />
            </div>
          ))}
        </div>
      )}

      {isFailed && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-center">
          <p className="text-sm text-destructive">Analysis failed: {job?.error_message || "Unknown error"}</p>
        </div>
      )}

      {hasResults && !isLoading && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleRules.map((rule, idx) => (
              <ComboCard key={rule.id} rule={rule} isTop={startIdx + idx === 0} totalOrders={job?.total_orders} onCreateCombo={handleCreateCombo} />
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalItems={rules.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            pageSizeOptions={[20, 50, 100]}
            itemLabel="combos"
          />
        </>
      )}

      {isEmpty && (
        <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
          <Icon name="shoppingBag" size={32} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Discover which products are frequently ordered together.</p>
          <p className="mt-1 text-xs text-muted-foreground">Run analysis to see promotions from your order history.</p>
        </div>
      )}

      <CreateComboModal key={selectedCombo?.id ?? "none"} open={showComboModal} onOpenChange={setShowComboModal} combo={selectedCombo} />
    </div>
  );
}
