import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";


const OPTIONS = [
  { key: "orders", label: "Orders Ledger (with Profit)" },
  { key: "variants", label: "Variant Profitability" },
  { key: "ingredients", label: "Ingredient Profitability" },
  { key: "trend", label: "Daily Trend (Gross/Net/COGS/Profit)" },
];

export default function ExportChoicesModal({ open, onOpenChange, onExport }) {
  const [selected, setSelected] = useState(() => new Set(OPTIONS.map((o) => o.key)));

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
    onExport(types);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export Excel</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-2">
          {OPTIONS.map((opt) => (
            <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={selected.has(opt.key)} onChange={() => toggle(opt.key)} className="h-4 w-4 rounded border-border" />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleExport} disabled={selected.size === 0}>Export</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
