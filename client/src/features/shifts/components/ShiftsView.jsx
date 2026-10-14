import { useState } from "react";
import { toast } from "sonner";
import { useShiftsList, useShiftMutations } from "../query";
import { useShiftsRealtime } from "@/realtime/subscriptions";
import useAuthStore from "@/features/auth/authStore";
import ShiftCard from "./ShiftCard";
import ShiftDetailDrawer from "./ShiftDetailDrawer";
import CloseShiftModal from "./CloseShiftModal";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import { Pagination } from "@/components/filters/Pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { formatVariance } from "@/lib/money";


/**
 * ShiftsView (BR-02)
 *
 * Admin view of all drawer sessions. Open drawers pin to the top
 * (always "now"); history follows the date range below.
 * Cards open the detail drawer; open cards carry close/force-close.
 */
export default function ShiftsView({ dateFrom, dateTo, onDateChange }) {
  // Live history: drawer open/close elsewhere refreshes this list.
  useShiftsRealtime();
  const user = useAuthStore((s) => s.user);
  const shiftMutations = useShiftMutations();
  const [closingShift, setClosingShift] = useState(null);
  const [detailShiftId, setDetailShiftId] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useShiftsList({
    status: "closed",
    page: String(historyPage),
    limit: String(pageSize),
    search: search || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const shifts = data?.data?.shifts ?? [];
  const { data: openData } = useShiftsList({ status: "open", limit: "100", search: search || undefined });
  const openCards = openData?.data?.shifts ?? [];
  const closedCards = shifts;
  const totalClosed = data?.data?.totalItems ?? 0;

  // Choose the closure endpoint by shift ownership; backend authorization still controls forced closure.
  async function handleCloseShiftConfirm(form) {
    if (!closingShift) return;
    const forced = closingShift.opened_by !== user?.id;
    try {
      const fn = forced ? shiftMutations.forceClose : shiftMutations.close;
      const res = await fn.mutateAsync({ id: closingShift.shift_id, data: form });
      const variance = Number(res?.data?.shift?.variance ?? 0);
      toast.success(
        variance === 0
          ? "Shift closed — exact"
          : `Shift closed — ${variance > 0 ? "over" : "short"} ${formatVariance(variance)}`,
      );
      setClosingShift(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to close shift");
    }
  }

  // A new date range starts the server-backed history pagination again.
  function handleDateChange(from, to) {
    setHistoryPage(1);
    onDateChange?.(from, to);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setSearch(searchInput.trim()); setHistoryPage(1); }}>
        <input aria-label="Search shifts by cashier or reference" value={searchInput} onChange={event => setSearchInput(event.target.value)}
          placeholder="Cashier name or shift reference…" maxLength={200} className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Search</button>
        {search && <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setSearchInput(""); setSearch(""); setHistoryPage(1); }}>Clear</button>}
      </form>
      {openCards.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Open now
          </p>
          <div className="grid gap-2 xl:grid-cols-2">
            {openCards.map((s) => (
              <ShiftCard
                key={s.shift_id}
                shift={s}
                onOpen={(shift) => setDetailShiftId(shift.shift_id)}
                onClose={setClosingShift}
                canClose
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            History
          </p>
          <div className="flex items-center gap-2">
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => handleDateChange("", "")}
                className="cursor-pointer text-xs text-primary hover:underline"
              >
                All time
              </button>
            )}
            <DateRangeFilter
              dateFrom={dateFrom || null}
              dateTo={dateTo || null}
              onDateChange={handleDateChange}
            />
          </div>
        </div>
        {isError ? <div role="alert" className="rounded-xl border p-4 text-sm">
          <p>Shift history could not be loaded.</p>
          <button type="button" className="mt-2 text-primary underline" onClick={() => refetch()}>Retry</button>
        </div> : closedCards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border">
            <EmptyState
              icon="clock"
              title="No shifts in this range"
              copy="Cashiers open one from the POS to start selling."
            />
          </div>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2">
            {closedCards.map((s) => (
              <ShiftCard
                key={s.shift_id}
                shift={s}
                onOpen={(shift) => setDetailShiftId(shift.shift_id)}
                onClose={setClosingShift}
                canClose={s.status === "open"}
              />
            ))}
          </div>
        )}
        {(totalClosed > pageSize || historyPage > 1) && (
          <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
            <Pagination
              currentPage={historyPage}
              totalItems={totalClosed}
              pageSize={pageSize}
              onPageChange={setHistoryPage}
              onPageSizeChange={(size) => { setPageSize(size); setHistoryPage(1); }}
              pageSizeOptions={[20, 50, 100]}
              itemLabel="shifts"
            />
          </div>
        )}
      </div>

      <ShiftDetailDrawer
        open={!!detailShiftId}
        onOpenChange={(open) => { if (!open) setDetailShiftId(null); }}
        shiftId={detailShiftId}
        onCloseShift={(shift) => setClosingShift(shift)}
      />
      <CloseShiftModal
        open={!!closingShift}
        onOpenChange={(open) => { if (!open) setClosingShift(null); }}
        shift={closingShift}
        forced={!!closingShift && closingShift.opened_by !== user?.id}
        onConfirm={handleCloseShiftConfirm}
        isLoading={shiftMutations.close.isPending || shiftMutations.forceClose.isPending}
      />
    </div>
  );
}
