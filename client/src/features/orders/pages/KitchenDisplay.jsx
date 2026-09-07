import { useState } from "react";
import { toast } from "sonner";
import { useKitchenDisplay } from "../query";
import KitchenHeader from "../components/KitchenHeader";
import ProcessingCard from "../components/ProcessingCard";
import NextCard from "../components/NextCard";
import QueueList from "../components/QueueList";
import ConfirmReadyModal from "../components/ConfirmReadyModal";
import PrimarySpinner from "@/components/ui/spinner";

export default function KitchenDisplay() {
  const {
    loading,
    refreshing,
    processing,
    nextInLine,
    accepted,
    counts,
    toggleItemCheck,
    getCheckedSet,
    markReady,
    markingReady,
  } = useKitchenDisplay();

  const [pendingOrder, setPendingOrder] = useState(null);
  const [animatingOut, setAnimatingOut] = useState(false);

  async function handleConfirmReady() {
    if (!pendingOrder) return;
    const cs = getCheckedSet(pendingOrder.order_id);
    if (cs.size !== (pendingOrder.items?.length ?? 0)) {
      toast.error("Check off all items before marking as ready");
      setPendingOrder(null);
      return;
    }
    try {
      setAnimatingOut(true);
      await new Promise((r) => setTimeout(r, 550));
      await markReady(pendingOrder.order_id);
      toast.success(`Order #${pendingOrder.order_number} marked ready — Queue advanced`);
      setPendingOrder(null);
      setAnimatingOut(false);
    } catch (err) {
      setAnimatingOut(false);
      toast.error(err.response?.data?.message || "Could not mark order as ready.");
    }
  }

  if (loading) {
    return (
      <div className="h-screen overflow-hidden bg-background text-foreground font-sans flex items-center justify-center">
        <PrimarySpinner />
      </div>
    );
  }

  const checkedSet = processing ? getCheckedSet(processing.order_id) : new Set();
  const interactionsDisabled = markingReady || animatingOut;

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground font-sans flex flex-col">
      <KitchenHeader counts={counts} refreshing={refreshing} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left — Now Preparing */}
        <div className="flex flex-col p-5 gap-4 flex-1 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-3 h-3 rounded-full kds-pulse-dot bg-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Now Preparing
            </span>
            <div className="h-px flex-1 bg-primary/15" />
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <ProcessingCard
              order={processing}
              checkedSet={checkedSet}
              onToggleItem={toggleItemCheck}
              onMarkReady={setPendingOrder}
              animatingOut={animatingOut}
              disabled={interactionsDisabled}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="w-px shrink-0 bg-border/60" />

        {/* Right — Sidebar */}
        <div className="bg-sidebar flex flex-col w-80 xl:w-96 shrink-0 overflow-hidden">
          {/* Prepare Ahead */}
          <div className="p-4 border-b border-border/60 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full kds-pulse-dot bg-sky-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-sky-500">
                Prepare Ahead
              </span>
            </div>
            <NextCard order={nextInLine} />
          </div>

          {/* Accepted Queue */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Accepted Queue
                </span>
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-background border border-border text-warning">
                  {accepted.length}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 modal-scroll">
              <QueueList orders={accepted} />
            </div>
          </div>
        </div>
      </div>

      <ConfirmReadyModal
        order={pendingOrder}
        open={!!pendingOrder}
        onConfirm={handleConfirmReady}
        onCancel={() => !markingReady && setPendingOrder(null)}
        loading={markingReady}
      />
    </div>
  );
}
