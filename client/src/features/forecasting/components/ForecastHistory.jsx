import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ForecastHistory — select between current and previous forecast runs.
 */
export default function ForecastHistory({ history, currentJobId, onSelect }) {
  const jobs = history?.data?.jobs || [];

  if (!jobs.length) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">History:</span>
      {jobs.map((job, idx) => {
        const label = idx === 0 ? "Current" : "Previous";
        const isFailed = job.status === "failed";
        const date = job.completed_at
          ? new Date(job.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "N/A";
        const isActive = job.id === currentJobId;

        return (
          <button
            key={job.id}
            onClick={() => onSelect(job.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : isFailed
                  ? "text-destructive hover:bg-destructive/10 border border-destructive/30"
                  : "text-muted-foreground hover:bg-muted border border-border"
            )}
          >
            {label} ({date}){isFailed ? " - Failed" : ""}
          </button>
        );
      })}
    </div>
  );
}
