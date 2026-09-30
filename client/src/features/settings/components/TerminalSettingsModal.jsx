import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  shouldAutoPrint,
  setAutoPrint,
  getPaperSize,
  setPaperSize,
  getPrinterConnection,
  setPrinterConnection,
  shouldPrintLogo,
  setPrintLogo,
  printSampleReceipt,
} from "@/features/receipts/api";

/**
 * TerminalSettingsModal — per-terminal receipt + printer settings (cashier).
 *
 * WHY it exists: cashiers are route-locked to /pos* so admin /settings is
 * unreachable; their settings surface is terminal scope (this device), all
 * localStorage-backed via receipts/api. Content extracted from the old
 * PosTerminal printer popover so the header button and the profile-menu
 * Settings item share one component. State synced from storage on open.
 */
export default function TerminalSettingsModal({ open, onOpenChange, onChanged }) {
  const [autoPrint, setAutoPrintState] = useState(false);
  const [paperSize, setPaperSizeState] = useState("58mm");
  const [connection, setConnectionState] = useState("system");
  const [logoOn, setLogoOnState] = useState(true);

  useEffect(() => {
    if (open) {
      setAutoPrintState(shouldAutoPrint());
      setPaperSizeState(getPaperSize());
      setConnectionState(getPrinterConnection());
      setLogoOnState(shouldPrintLogo());
    }
  }, [open ]);

  function notify() {
    onChanged?.();
  }

  function handleToggleAutoPrint() {
    const next = !autoPrint;
    setAutoPrint(next);
    setAutoPrintState(next);
    notify();
  }

  function changePaper(size) {
    const normalized = size === "80mm" ? "80mm" : "58mm";
    setPaperSize(normalized);
    setPaperSizeState(normalized);
    notify();
  }

  function changeConnection(conn) {
    const normalized = conn === "rawbt" || conn === "webusb" ? conn : "system";
    setPrinterConnection(normalized);
    setConnectionState(normalized);
    notify();
  }

  function toggleLogo() {
    const next = !logoOn;
    setPrintLogo(next);
    setLogoOnState(next);
    notify();
  }

  function handleTestPrint() {
    printSampleReceipt();
    if (connection === "rawbt") {
      toast.info("Opening RawBT — confirm the print there", { duration: 4000 });
    } else {
      toast.info("Test receipt sent to system print dialog");
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogClose onClick={() => onOpenChange(false)} aria-label="Close" />
        <DialogHeader>
          <DialogTitle>Terminal Settings</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Printer — JP-58H. Per-terminal. Laptop uses USB driver, tablet uses Bluetooth.
          </p>
        </DialogHeader>

        <button
          type="button"
          onClick={handleToggleAutoPrint}
          className="flex w-full items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs"
        >
          <span className="font-semibold text-foreground">Auto-print receipts</span>
          <span className={autoPrint ? "font-bold text-primary" : "text-muted-foreground"}>
            {autoPrint ? "On" : "Off"}
          </span>
        </button>

        <p className="mb-1 mt-3 type-small font-semibold text-foreground">Paper</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["58mm", "80mm"]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changePaper(s)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                paperSize === s ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s}{s === "58mm" ? " (JP-58H)" : ""}
            </button>
          ))}
        </div>

        <p className="mb-1 mt-3 type-small font-semibold text-foreground">Connection</p>
        <div className="flex flex-col gap-1.5">
          {([
            { value: "system", label: "USB driver", hint: "Laptop USB001 / COM8 queue" },
            { value: "rawbt", label: "Bluetooth (RawBT)", hint: "Android tablet + JP-58H" },
            { value: "webusb", label: "WebUSB", hint: "Experimental direct USB" },
          ]).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => changeConnection(o.value)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-left transition-colors",
                connection === o.value ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <span className="block text-xs font-semibold text-foreground">{o.label}</span>
              <span className="block type-small text-muted-foreground">{o.hint}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleLogo}
          className="mt-3 flex w-full items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs"
        >
          <span className="font-semibold text-foreground">Logo on receipt</span>
          <span className={logoOn ? "font-bold text-primary" : "text-muted-foreground"}>
            {logoOn ? "On" : "Off"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleTestPrint}
          className="mt-2 w-full rounded-md bg-primary px-2 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Test Print
        </button>
      </DialogContent>
    </Dialog>
  );
}
