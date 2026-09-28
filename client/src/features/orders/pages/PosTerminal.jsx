/**
 * PosTerminal — full-screen terminal shell (header + Outlet for /pos, /pos/orders, /pos/kitchen).
 * WHY it exists: gives cashiers/kitchen a chromeless workspace separate from the admin
 * sidebar; owns view-switch, receipt auto-print toggle, and logout. Query keys consumed:
 * none (no useQuery; receipts use localStorage via shouldAutoPrint). Guards: router-level
 * staff roles; no BR-02 shift gate here (lives in OrdersPage/POS).
 * State: Query [] | local [autoPrint] | Zustand [user, logout via useAuthStore].
 */
import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import useAuthStore from "@/features/auth/authStore";
import { logoutRequest } from "@/features/auth/api";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { FilterPill } from "@/components/filters/FilterPill";
import ModeToggle from "@/components/ModeToggle";
import Icon from "@/components/ui/icon";
import ReceiptPrintHost from "@/features/receipts/ReceiptPrintHost";
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

const VIEW_OPTIONS = [
  { value: "pos", label: "POS" },
  { value: "orders", label: "Orders" },
  { value: "kitchen", label: "Kitchen" },
];

export default function PosTerminal() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [autoPrint, setAutoPrintState] = useState(() => shouldAutoPrint());
  const [paperSize, setPaperSizeState] = useState(() => getPaperSize());
  const [connection, setConnectionState] = useState(() => getPrinterConnection());
  const [logoOn, setLogoOnState] = useState(() => shouldPrintLogo());
  const [printerOpen, setPrinterOpen] = useState(false);

  function toggleAutoPrint() {
    const next = !autoPrint;
    setAutoPrint(next);
    setAutoPrintState(next);
  }

  function changePaper(size) {
    setPaperSize(size);
    setPaperSizeState(size === "80mm" ? "80mm" : "58mm");
  }

  function changeConnection(conn) {
    setPrinterConnection(conn);
    setConnectionState(conn === "rawbt" || conn === "webusb" ? conn : "system");
  }

  function toggleLogo() {
    const next = !logoOn;
    setPrintLogo(next);
    setLogoOnState(next);
  }

  function handleTestPrint() {
    printSampleReceipt();
    if (connection === "rawbt") {
      toast.info("Opening RawBT — confirm the print there", { duration: 4000 });
    } else {
      toast.info("Test receipt sent to system print dialog");
    }
    setPrinterOpen(false);
  }

  const activeView = location.pathname.startsWith("/pos/orders")
    ? "orders"
    : location.pathname.startsWith("/pos/kitchen")
      ? "kitchen"
      : "pos";

  function handleViewChange(value) {
    if (value === "orders") {
      navigate("/pos/orders");
    } else if (value === "kitchen") {
      navigate("/pos/kitchen");
    } else {
      navigate("/pos");
    }
  }

  async function handleLogout() {
    const ok = await confirm({
      title: "Sign out?",
      message: "Are you sure you want to sign out?",
      confirmLabel: "Sign out",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await logoutRequest();
    } catch {
      // Logout even if request fails
    } finally {
      logout();
      navigate("/login");
    }
  }

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        {/* Left — brand */}
        <div className="flex items-center gap-2">
          <img src="/favicon.png" alt="Abbey's Kitchenette" className="h-5 w-5 rounded" />
          <span className="font-serif text-lg font-semibold">SmartCafe</span>
        </div>

        {/* Center — view toggle */}
        <FilterPill
          options={VIEW_OPTIONS}
          value={activeView}
          onChange={handleViewChange}
        />

        {/* Right — printer, theme, profile, sign out */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoPrint}
            title={autoPrint ? "Auto-print receipts: on" : "Auto-print receipts: off"}
            aria-label="Toggle auto-print receipts"
            className={`rounded-md p-2 transition-colors hover:bg-muted ${autoPrint ? "text-foreground" : "text-muted-foreground/40"}`}
          >
            <Icon name="receipt" size={18} />
          </button>
          <div className="relative">
            <button
              onClick={() => setPrinterOpen((o) => !o)}
              title={`Printer: ${paperSize} / ${connection === "rawbt" ? "Bluetooth" : connection === "webusb" ? "WebUSB" : "USB driver"}`}
              aria-label="Printer settings"
              className={`rounded-md p-2 transition-colors hover:bg-muted ${printerOpen ? "text-foreground" : "text-muted-foreground"}`}
            >
              <Icon name="settings" size={18} />
            </button>
            {printerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPrinterOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
                  <p className="text-xs font-semibold text-foreground">Printer — JP-58H</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Per-terminal. Laptop uses USB driver, tablet uses Bluetooth.
                  </p>

                  <p className="mb-1 mt-3 text-[11px] font-semibold text-foreground">Paper</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["58mm", "80mm"]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => changePaper(s)}
                        className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                          paperSize === s ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {s}{s === "58mm" ? " (JP-58H)" : ""}
                      </button>
                    ))}
                  </div>

                  <p className="mb-1 mt-3 text-[11px] font-semibold text-foreground">Connection</p>
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
                        className={`rounded-md border px-2 py-1.5 text-left transition-colors ${
                          connection === o.value ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/40"
                        }`}
                      >
                        <span className="block text-xs font-semibold text-foreground">{o.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{o.hint}</span>
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
                </div>
              </>
            )}
          </div>
          <ModeToggle />

          {/* Profile */}
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {initials}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-medium leading-tight">{user?.name}</p>
              <p className="text-[10px] capitalize text-muted-foreground">{user?.role}</p>
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            aria-label="Sign out"
          >
            <Icon name="logOut" size={18} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <ReceiptPrintHost />
    </div>
  );
}
