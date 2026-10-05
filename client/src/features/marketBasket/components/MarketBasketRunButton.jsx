import { useState, useEffect } from "react";
import { useAnalyzeMarketBasket, useMarketBasketJob } from "../query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Icon from "@/components/ui/icon";
import { ButtonSpinner } from "@/components/ui/spinner";

const STORAGE_KEY = "mbaJobId";

/**
 * MarketBasketRunButton — triggers MBA analysis and polls for completion.
 * Persists active job ID in localStorage so progress survives navigation.
 * Shows spinner immediately on click (optimistic UI).
 */
/** Start or resume analysis without treating browser state as a server job lock. */
export default function MarketBasketRunButton({ compact = false }) {
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
  // Missing query data after a fetch is a UI recovery signal, not an explicit server 404.
  const isNotFound = isFetchedAfterMount && !status && !optimisticPending && activeJobId;
  const isStatusLoading = activeJobId && isFetching && !isFetchedAfterMount;

  const showSpinner = (optimisticPending && !status) || runMutation.isPending || isRunning || isStatusLoading;

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
      try { localStorage.removeItem(STORAGE_KEY); }
      catch { /* ignore */ }
    }
  }, [isComplete, isFailed, isNotFound]);



  // Both compact and full controls use the same submission and returned job identity.
  const handleRun = async () => {
    if (showSpinner) return;
    setActiveJobId(null);
    setOptimisticPending(true);
    try {
      const res = await runMutation.mutateAsync();
      const payload = res?.data;
      const jobId = payload?.job_id;
      if (jobId) {
        setActiveJobId(jobId);
        if (payload?.status === "busy") {
          toast.info("Attached to the running analysis — showing its progress.");
        }
        setOptimisticPending(false);
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

  if (compact) {
    return (
      <button
        onClick={handleRun}
        disabled={showSpinner}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium transition-colors",
          showSpinner ? "text-muted-foreground cursor-not-allowed" : "text-primary hover:underline"
        )}
      >
        {showSpinner ? (
          <>
            <ButtonSpinner />
            {isRunning ? "Running..." : "Updating..."}
          </>
        ) : (
          <>
            <Icon name="sparkles" size={12} />
            Run Analysis
          </>
        )}
      </button>
    );
  }

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
          <ButtonSpinner />
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
