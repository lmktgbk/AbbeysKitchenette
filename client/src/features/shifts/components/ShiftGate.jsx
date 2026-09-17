import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveShift, useStartShift, useEndShift } from "../query";
import Icon from "@/components/ui/icon";

/**
 * ShiftGate — wraps POS to enforce shift management.
 * If no active shift, shows "Start Shift" dialog.
 * Shows active shift info in the header.
 */
export default function ShiftGate({ children }) {
  const { data: activeShift, isLoading } = useActiveShift();
  const startShiftMutation = useStartShift();
  const endShiftMutation = useEndShift();
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [actualCash, setActualCash] = useState("");
  const [endNotes, setEndNotes] = useState("");

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Icon name="loader-2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeShift) {
    return (
      <>
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <Icon name="clock" size={48} className="text-muted-foreground/30" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">No Active Shift</h2>
            <p className="text-sm text-muted-foreground">Start a shift before taking orders.</p>
          </div>
          <Button onClick={() => setShowStartModal(true)}>
            <Icon name="play" size={16} className="mr-2" />
            Start Shift
          </Button>
        </div>

        {/* Start Shift Modal */}
        {showStartModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Start Shift</h3>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Opening Cash (₱)</label>
                  <Input
                    type="number"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowStartModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={startShiftMutation.isPending}
                    onClick={async () => {
                      try {
                        await startShiftMutation.mutateAsync({
                          opening_cash: Number(openingCash) || 0,
                        });
                        setShowStartModal(false);
                      } catch (err) {
                        // Error handled by mutation
                      }
                    }}
                  >
                    {startShiftMutation.isPending ? "Starting..." : "Start Shift"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Active shift indicator */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Active Shift</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Opened {new Date(activeShift.started_at || activeShift.startedAt).toLocaleTimeString()}
          </span>
          <span className="text-xs text-muted-foreground">
            • Opening: ₱{Number(activeShift.opening_cash || activeShift.openingCash || 0).toLocaleString()}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowEndModal(true)}
        >
          <Icon name="square" size={12} className="mr-1" />
          End Shift
        </Button>
      </div>

      {/* POS content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>

      {/* End Shift Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">End Shift</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Actual Cash on Hand (₱)</label>
                <Input
                  type="number"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  placeholder="Count cash register"
                  min="0"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Input
                  value={endNotes}
                  onChange={(e) => setEndNotes(e.target.value)}
                  placeholder="Any notes..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowEndModal(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!actualCash || endShiftMutation.isPending}
                  onClick={async () => {
                    try {
                      await endShiftMutation.mutateAsync({
                        id: activeShift.shift_id || activeShift.shiftId,
                        data: {
                          actual_cash: Number(actualCash),
                          notes: endNotes || undefined,
                        },
                      });
                      setShowEndModal(false);
                      setActualCash("");
                      setEndNotes("");
                    } catch (err) {
                      // Error handled by mutation
                    }
                  }}
                >
                  {endShiftMutation.isPending ? "Closing..." : "End Shift"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
