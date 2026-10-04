import { useState, useEffect, memo } from "react";
import { useRunDemandForecast, useDemandStatus } from "../query";
import { cn } from "@/lib/utils";
import { ButtonSpinner } from "@/components/ui/spinner";
import { toast } from "sonner";

const STORAGE_KEY = "forecastJobId";

/**
 * ForecastRunButton — triggers forecast and shows progress bar.
 * Persists active job ID in localStorage so progress survives navigation.
 * Shows spinner immediately on click (optimistic UI).
 */
function ForecastRunButton({ onJobComplete }) {
  const [activeJobId, setActiveJobId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  });
  const [optimisticPending, setOptimisticPending] = useState(false);

  const runMutation = useRunDemandForecast();
  const { data: statusData, isPending: statusPending } = useDemandStatus(activeJobId);

  const status = statusData?.data;
  const isRunning = status?.status === "running";
  const isComplete = status?.status === "completed";
  const isFailed = status?.status === "failed";
  const isNotFound = status?.status === "not_found";
  const progress = status?.total_variants
    ? Math.round(((status.completed + status.failed) / status.total_variants) * 100)
    : 0;

  const showSpinner = (optimisticPending && !status) || runMutation.isPending || isRunning || (activeJobId && statusPending);

  // Persist job ID to localStorage
  useEffect(() => {
    if (activeJobId) {
      try { localStorage.setItem(STORAGE_KEY, String(activeJobId)); }
      catch { /* ignore */ }
    }
  }, [activeJobId]);

  // Clear localStorage and notify parent on terminal states
  useEffect(() => {
    if (isComplete || isFailed || isNotFound) {
      try { localStorage.removeItem(STORAGE_KEY); }
      catch { /* ignore */ }
    }
    if ((isComplete || isFailed) && activeJobId) {
      onJobComplete?.(activeJobId);
    }
  }, [isComplete, isFailed, isNotFound, activeJobId, onJobComplete]);



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
          toast.info("Attached to the running forecast — showing its progress.");
        }
        setOptimisticPending(false);
      } else {
        setOptimisticPending(false);
        toast.error("A forecast is already running. Please wait.");
      }
    } catch (err) {
      setOptimisticPending(false);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to start forecast. The forecasting service may be temporarily unavailable.";
      toast.error(msg);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
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
            Updating...
          </>
        ) : (
          "Update Forecast"
        )}
      </button>

      {isRunning && status && (
        <div className="flex flex-1 items-center gap-3 min-w-[200px]">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            {status.total_variants ? (
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
            )}
          </div>
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {status.total_variants
              ? `Preparing ${status.completed + status.failed} of ${status.total_variants}`
              : "Starting…"}
          </span>
        </div>
      )}

      {isComplete && status && (
        <span className="text-xs font-medium text-green-600">
          Ready: {status.completed} products, {status.failed ? `${status.failed} need more sales` : "all ready"}
        </span>
      )}

      {isFailed && (
        <span className="text-xs font-medium text-red-600">
          Needs attention: {status?.error_message || "Something went wrong"}
        </span>
      )}
    </div>
  );
}

export default memo(ForecastRunButton);
