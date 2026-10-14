import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "../sessionRestore";
import { retryDelaySeconds, formatRetryWait } from "../api";
import { Button } from "@/components/ui/button";
import PrimarySpinner from "@/components/ui/spinner";

/** Initial checks gate protected content. An established session can instead
 * show this compact retry notice without clearing its identity or feature cache.
 */
export default function SessionCheck({ compact = false }) {
  const { error, errorUpdatedAt, isError, isFetching, refetch } = useQuery(sessionQueryOptions);
  // The query's failure timestamp fixes the deadline across remounts/renders.
  const deadline = errorUpdatedAt + retryDelaySeconds(error) * 1000;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!isError) return compact ? null : <PrimarySpinner />;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <div role="status" className={compact ? "flex flex-wrap items-center justify-center gap-3 border-b border-border bg-muted p-3 text-sm" : "mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-12 text-center"}>
      <p>{compact ? "Session check temporarily unavailable. Your login has not been cleared." : "We couldn’t check your session. Please retry to continue."}</p>
      <Button type="button" variant="outline" disabled={isFetching || remaining > 0} onClick={() => { void refetch(); }}>
        {isFetching ? "Checking…" : remaining > 0 ? `Retry in ${formatRetryWait(remaining)}` : "Retry session check"}
      </Button>
    </div>
  );
}
