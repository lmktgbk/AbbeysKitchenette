import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CASH_CHIPS = [100, 500, 1000];

/**
 * OpenShiftModal (BR-02)
 *
 * Starts a drawer session with a declared opening cash.
 * Opening cash is required and has no default.
 */
export default function OpenShiftModal({ open, onOpenChange, onConfirm, isLoading }) {
  const [openingCash, setOpeningCash] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);

  // Fresh cash field on every open.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setOpeningCash("");
  }

  const cash = openingCash === "" ? null : Number(openingCash);
  const isValid = cash != null && Number.isFinite(cash) && cash >= 0;

  function handleConfirm() {
    if (!isValid) return;
    onConfirm?.({ opening_cash: cash });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader className="mb-1">
          <DialogTitle>Open shift</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Count the drawer to start selling.
          </p>
        </DialogHeader>

        <div className="space-y-2.5">
          {/* Opening cash — the hero input */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Opening cash</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                ₱
              </span>
              <Input
                type="number"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0"
                className="h-12 pl-9 text-xl font-bold"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {CASH_CHIPS.map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setOpeningCash(String(amt))}
                >
                  ₱{amt.toLocaleString()}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setOpeningCash("")}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Actions — standard pair; the money moment lives in payments */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 font-semibold"
              onClick={() => onOpenChange?.(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!isValid || isLoading}
              onClick={handleConfirm}
              className="flex-[2] font-bold"
            >
              {isLoading ? "Opening..." : "Open shift"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
