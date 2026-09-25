import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


const OPTIONS = [
  { key: "orders", label: "Orders Ledger (with Profit)" },
  { key: "variants", label: "Variant Profitability" },
  { key: "ingredients", label: "Ingredient Profitability" },
  { key: "trend", label: "Daily Trend (Gross/Net/COGS/Profit)" },
  { key: "waste", label: "Waste Details" },
];

export default function ExportChoicesModal({ open, onOpenChange, onExport, dateFrom, dateTo }) {
  const [selected, setSelected] = useState(() => new Set(OPTIONS.map((o) => o.key)));
  const [format, setFormat] = useState("excel");

  const periodLabel = dateFrom || dateTo
    ? `${dateFrom || "…"} – ${dateTo || "…"}`
    : "All time";
  const coverageNote = format === "pdf"
    ? "PDF: KPI summary + latest 100 orders + full-period totals · summaries capped (Top 50 / Latest 200)."
    : "Excel: KPI summary sheet + full orders ledger + totals · summaries capped (Top 50 / Latest 200).";

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleExport() {
    const types = Array.from(selected);
    if (types.length === 0) return;
    onExport(types, format);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogClose onClick={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>Export Report</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-4 py-2">
          {["excel", "pdf"].map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="export-format"
                checked={format === f}
                onChange={() => setFormat(f)}
                className="h-4 w-4 border-border accent-primary"
              />
              {f === "excel" ? "Excel (.xlsx)" : "PDF (.pdf)"}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2 py-2">
          {OPTIONS.map((opt) => (
            <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={selected.has(opt.key)} onChange={() => toggle(opt.key)} className="h-4 w-4 rounded border-border accent-primary" />
              {opt.label}
            </label>
          ))}
        </div>
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Period: <span className="font-medium text-foreground">{periodLabel}</span>
          <br />
          {coverageNote}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleExport} disabled={selected.size === 0}>Export</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
