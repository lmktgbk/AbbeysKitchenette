import { useState, useEffect } from "react";
import { useAnalyzeMarketBasket, useMarketBasketJob } from "../query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Icon from "@/components/ui/icon";

const STORAGE_KEY = "mbaJobId";

/**
 * MarketBasketRunButton — triggers MBA analysis and polls for completion.
 * Persists active job ID in localStorage so progress survives navigation.
 * Shows spinner immediately on click (optimistic UI).
 */
export default function MarketBasketRunButton() {
  const [activeJobId, setActiveJobId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  });
  const [optimisticPending, setOptimisticPending] = useState(false);

  const runMutation = useAnalyzeMarketBasket();
  const { data: statusData, isFetchedAfterMount, isFetching } = useMarketBasketJob(activeJobId);

  const status = statusData?.data;
  const isRunning = status?.status === "running";
  const isComplete = status?.status === "completed";
  const isFailed = status?.status === "failed";
  const isNotFound = isFetchedAfterMount && !status && !optimisticPending && activeJobId;
  const isStatusLoading = activeJobId && isFetching && !isFetchedAfterMount;

  const showSpinner = optimisticPending || runMutation.isPending || isRunning || isStatusLoading;

  // Persist job ID to localStorage
  useEffect(() => {
    if (activeJobId) {
      try { localStorage.setItem(STORAGE_KEY, String(activeJobId)); }
      catch { /* ignore */ }
    }
  }, [activeJobId]);

  // Clear localStorage on terminal states
  useEffect(() => {
    if (isComplete || isFailed || isNotFound) {
      setOptimisticPending(false);
      try { localStorage.removeItem(STORAGE_KEY); }
      catch { /* ignore */ }
    }
  }, [isComplete, isFailed, isNotFound]);

  // Clear optimistic spinner when status polling confirms running
  useEffect(() => {
    if (isRunning) {
      setOptimisticPending(false);
    }
  }, [isRunning]);

  // If stored job ID returns not_found (e.g. server restarted), clear it
  useEffect(() => {
    if (isNotFound && activeJobId) {
      setActiveJobId(null);
    }
  }, [isNotFound, activeJobId]);

  const handleRun = async () => {
    if (showSpinner) return;
    setActiveJobId(null);
    setOptimisticPending(true);
    try {
      const res = await runMutation.mutateAsync();
      const jobId = res?.data?.job_id;
      if (jobId) {
        setActiveJobId(jobId);
      } else {
        setOptimisticPending(false);
        toast.error("Failed to start analysis. Please try again.");
      }
    } catch (err) {
      setOptimisticPending(false);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to start analysis. The MBA service may be temporarily unavailable.";
      toast.error(msg);
    }
  };

  return (
    <button
      onClick={handleRun}
      disabled={showSpinner}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        showSpinner
          ? "bg-muted text-muted-foreground cursor-not-allowed"
          : "bg-primary text-primary-foreground hover:bg-primary/90"
      )}
    >
      {showSpinner ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          {isRunning ? "Running..." : isStatusLoading ? "Checking..." : "Starting..."}
        </>
      ) : (
        <>
          <Icon name="sparkles" size={14} />
          Run Analysis
        </>
      )}
    </button>
  );
}
