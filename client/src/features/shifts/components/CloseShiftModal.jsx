import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShiftSummary } from "../query";
import { cn } from "@/lib/utils";
import { formatVariance } from "@/lib/money";

function SummaryRow({ label, value, bold, tone }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={cn("text-muted-foreground", bold && "font-semibold text-foreground")}>{label}</span>
      <span className={cn("font-medium tabular-nums", bold && "text-base font-bold", tone)}>{value}</span>
    </div>
  );
}

/**
 * CloseShiftModal (BR-02)
 *
 * Two phases: 1) review the breakdown (opening, cash sales, refunds,
 * e-wallet totals, expected), 2) declare the actual count. Variance
 * shows live; a note is required when it differs from zero.
 */
export default function CloseShiftModal({ open, onOpenChange, shift, forced, onConfirm, isLoading }) {
  const [actualCash, setActualCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const { data, isLoading: loadingSummary } = useShiftSummary(open ? shift?.shift_id : null);

  const summary = data?.data?.summary ?? null;
  const expected = summary ? Number(summary.expected_cash ?? 0) : null;
  const actual = actualCash === "" ? null : Number(actualCash);
  const variance = actual != null && expected != null ? Math.round((actual - expected + Number.EPSILON) * 100) / 100 : null;
  // Admin force-close always needs a note; otherwise only on mismatch.
  const needsNote = forced || (variance != null && variance !== 0);
  const isValid =
    summary && actual != null && Number.isFinite(actual) && actual >= 0 && (!needsNote || closeNote.trim().length > 0);

  function handleConfirm() {
    if (!isValid) return;
    onConfirm?.({ actual_cash: actual, close_note: closeNote.trim() || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto modal-scroll pb-4">
        <DialogClose onClick={() => onOpenChange?.(false)} aria-label="Close" />
        <DialogHeader>
          <DialogTitle>
            {forced ? "Force-close shift" : "Close shift"}
          </DialogTitle>
        </DialogHeader>

        {loadingSummary || !summary ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Phase 1 — review */}
            <div className="space-y-1 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
              <SummaryRow label="Opening cash" value={`₱${Number(summary.opening_cash).toLocaleString()}`} />
              <SummaryRow
                label={`Cash sales (${summary.cash_orders ?? 0} orders)`}
                value={`₱${Number(summary.cash_sales ?? 0).toLocaleString()}`}
              />
              <SummaryRow
                label={`Cash refunds (${summary.refund_count ?? 0})`}
                value={`−₱${Number(summary.cash_refunds ?? 0).toLocaleString()}`}
              />
              <SummaryRow label="GCash sales" value={`₱${Number(summary.gcash_sales ?? 0).toLocaleString()}`} />
              {Number(summary.gcash_refunds ?? 0) > 0 && (
                <SummaryRow label={`GCash refunds (${summary.gcash_refund_count ?? 0})`} value={`−₱${Number(summary.gcash_refunds ?? 0).toLocaleString()}`} />
              )}
              <SummaryRow label="Maya sales" value={`₱${Number(summary.maya_sales ?? 0).toLocaleString()}`} />
              {Number(summary.maya_refunds ?? 0) > 0 && (
                <SummaryRow label={`Maya refunds (${summary.maya_refund_count ?? 0})`} value={`−₱${Number(summary.maya_refunds ?? 0).toLocaleString()}`} />
              )}
              <div className="border-t border-border pt-1">
                <SummaryRow
                  label="Expected in drawer"
                  value={`₱${Number(summary.expected_cash ?? 0).toLocaleString()}`}
                  bold
                />
              </div>
            </div>

            {(summary.open_orders ?? 0) > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {summary.open_orders} order{summary.open_orders === 1 ? "" : "s"} still in the kitchen
                (₱{Number(summary.open_orders_total ?? 0).toLocaleString()} already counted as drawer cash).
              </p>
            )}

            {/* Phase 2 — declare */}
            <div className="space-y-1.5 pb-1">
              <label className="text-sm font-medium">Actual cash count (₱)</label>
              <Input
                type="number"
                min="0"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="Count the drawer, enter amount"
                className="h-10 text-base font-semibold"
                autoFocus
              />
              <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">Difference</span>
                <span className={cn(
                  "text-lg font-bold tabular-nums",
                  variance == null && "text-muted-foreground",
                  variance === 0 && "text-green-600 dark:text-green-400",
                  variance != null && variance !== 0 && "text-destructive",
                )}>
                  {variance == null ? "—" : formatVariance(variance)}
                </span>
              </div>
              {needsNote && (
                <div className="space-y-1 pt-1">
                  <label className="text-sm font-medium">Difference note</label>
                  <Input
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    placeholder="e.g. Short ₱100 — wrong change given (required)"
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 border-t border-border pt-2.5">
          <div className="flex w-full gap-2">
            <Button variant="outline" size="sm" className="flex-1 font-semibold" onClick={() => onOpenChange?.(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!isValid || isLoading} onClick={handleConfirm} className="flex-[2] font-bold">
              {isLoading ? "Closing..." : "End shift"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
