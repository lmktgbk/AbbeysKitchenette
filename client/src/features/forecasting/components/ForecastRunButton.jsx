import { useState, useEffect } from "react";
import { useRunDemandForecast, useDemandStatus } from "../query";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STORAGE_KEY = "forecastJobId";

/**
 * ForecastRunButton — triggers forecast and shows progress bar.
 * Persists active job ID in localStorage so progress survives navigation.
 */
export default function ForecastRunButton({ onJobComplete }) {
  const [activeJobId, setActiveJobId] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; }
    catch { return null; }
  });

  const runMutation = useRunDemandForecast();
  const { data: statusData } = useDemandStatus(activeJobId);

  const status = statusData?.data;
  const isRunning = status?.status === "running";
  const isComplete = status?.status === "completed";
  const isFailed = status?.status === "failed";
  const isNotFound = status?.status === "not_found";
  const progress = status?.total_variants
    ? Math.round(((status.completed + status.failed) / status.total_variants) * 100)
    : 0;

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

  // If stored job ID returns not_found (e.g. server restarted), clear it
  useEffect(() => {
    if (isNotFound && activeJobId) {
      setActiveJobId(null);
    }
  }, [isNotFound, activeJobId]);

  const handleRun = async () => {
    if (isRunning) return;
    setActiveJobId(null);
    try {
      const res = await runMutation.mutateAsync();
      const jobId = res?.data?.job_id;
      if (jobId) {
        setActiveJobId(jobId);
      } else if (res?.data?.status === "busy") {
        toast.error("A forecast is already running. Please wait.");
      }
    } catch (err) {
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
        disabled={isRunning || runMutation.isPending}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
          isRunning || runMutation.isPending
            ? "bg-muted text-muted-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {isRunning || runMutation.isPending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            Running...
          </>
        ) : (
          "Run Forecast"
        )}
      </button>

      {isRunning && status && (
        <div className="flex flex-1 items-center gap-3 min-w-[200px]">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {status.completed + status.failed}/{status.total_variants}
          </span>
        </div>
      )}

      {isComplete && status && (
        <span className="text-xs font-medium text-green-600">
          Complete: {status.completed} forecasted, {status.failed} skipped
        </span>
      )}

      {isFailed && (
        <span className="text-xs font-medium text-red-600">
          Failed: {status?.error_message || "Unknown error"}
        </span>
      )}
    </div>
  );
}
