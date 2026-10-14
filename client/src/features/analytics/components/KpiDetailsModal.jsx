import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { orderNumberLabel } from "@/lib/orderNumber";
import { useKpiDetails } from "../query";
import { Pagination } from "@/components/filters/Pagination";

const peso = value => Number(value ?? 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
const kinds = { "Gross Sales": "orders", Discounts: "discounts", "Net Sales": "orders", Transactions: "orders", COGS: "cogs" };

/** Fetch ledger rows only when opened; formulas reuse the selected period's KPI snapshot. */
export default function KpiDetailsModal({ label, kpis, dateFrom, dateTo, onClose }) {
  const [page, setPage] = useState(1);
  const kind = kinds[label];
  const query = useKpiDetails({ kind, dateFrom, dateTo, page }, Boolean(kind));
  const result = query.data?.data;
  const rows = result?.rows ?? [];
  const retained = kpis?.retainedPaymentDetails ?? [];
  const total = kind ? result?.total ?? 0 : label === "Retained Payments" ? retained.length : 0;
  const formulas = {
    "Average Transaction Value": [
      ["Completed net sales", peso(kpis?.netSales)], ["Completed transactions", kpis?.transactions ?? 0],
      ["Net sales ÷ transactions", peso(kpis?.atv)], ["Units ÷ transactions", `${kpis?.unitsPerTxn ?? 0} items/order`],
    ],
    "Gross Profit": [["Completed net sales", peso(kpis?.netSales)], ["FIFO ingredient cost", `− ${peso(kpis?.cogs)}`], ["Gross profit", peso(kpis?.grossProfit)]],
    "Net Profit": [["Gross profit", peso(kpis?.grossProfit)], ["Retained payments", `+ ${peso(kpis?.retainedPayments)}`],
      ["Recorded ingredient losses", `− ${peso(kpis?.totalLosses)}`], ["Net profit", peso(kpis?.netProfit)]],
  };
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogClose onClick={onClose} />
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{dateFrom || dateTo ? `${dateFrom || "Beginning"} – ${dateTo || "Latest"}` : "All time"} · Order-date period</p>
        <div className="min-h-0 overflow-auto">
          {kind && query.isPending && <p role="status" className="py-6 text-sm">Loading records…</p>}
          {kind && query.isError && <div role="alert" className="py-6 text-sm"><p>Could not load the breakdown.</p><button type="button" className="mt-2 text-primary underline" onClick={() => query.refetch()}>Retry</button></div>}
          {kind && !query.isPending && !query.isError && (rows.length ? <table className="w-full text-sm whitespace-nowrap">
            <thead><tr className="border-b text-left text-muted-foreground">
              {(kind === "cogs" ? ["Ingredient", "Consumed", "FIFO cost"] : ["Order / Date", "Payment", "Items", "Gross", "Discount", "Net"]).map(title => <th key={title} className="px-3 py-2 font-medium">{title}</th>)}
            </tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.order_id ?? index} className="border-b">
              {kind === "cogs" ? <><td className="px-3 py-3">{row.ingredient_name}</td><td className="px-3 py-3">{Number(row.quantity).toLocaleString()} {row.unit}</td><td className="px-3 py-3">{peso(row.cost)}</td></> : <>
                <td className="px-3 py-3">{orderNumberLabel(row.order_number)}<span className="block text-xs text-muted-foreground">{String(row.order_date).slice(0, 10)}</span></td>
                <td className="px-3 py-3 capitalize">{row.payment_method ?? "cash"}</td><td className="px-3 py-3">{row.units}</td>
                <td className="px-3 py-3">{peso(row.gross)}</td><td className="px-3 py-3">{peso(row.discount)}<span className="block text-xs text-muted-foreground capitalize">{row.discount_type === "none" ? "" : row.discount_type}</span></td><td className="px-3 py-3">{peso(row.net)}</td>
              </>}
            </tr>)}</tbody>
          </table> : <p className="py-6 text-sm">No records in this period.</p>)}
          {label === "Retained Payments" && <div className="space-y-3">
            {retained.slice((page - 1) * 20, page * 20).map(row => <div key={row.order_id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span>{orderNumberLabel(row.order_number)} · {String(row.date).slice(0, 10)}</span><strong>{peso(row.amount)}</strong></div>
              <p className="capitalize text-muted-foreground">{row.payment_method ?? "cash"}</p><p className="break-words">{row.reason || "Historical reason not recorded"}</p>
            </div>)}
            {!retained.length && <p className="py-6 text-sm">No retained payments in this period.</p>}
          </div>}
          {formulas[label] && <dl className="divide-y rounded-lg border px-4">
            {formulas[label].map(([name, value]) => <div key={name} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt className="text-muted-foreground">{name}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
          </dl>}
          {label === "COGS" && <p className="mt-3 text-xs text-muted-foreground">Recorded consumption cost from the actual FIFO batches, excluding reversed deductions.</p>}
          {label === "Retained Payments" && <p className="mt-3 text-xs text-muted-foreground">Payments kept after refunds, excluding completed sales.</p>}
          {label === "Net Profit" && <p className="mt-3 text-xs text-muted-foreground">Operating expenses are not included. Ingredient losses follow their recorded loss dates.</p>}
        </div>
        {(total > 20 || page > 1) && <fieldset disabled={query.isFetching} className="min-w-0 shrink-0">
          <Pagination currentPage={page} totalItems={total} pageSize={20} onPageChange={setPage}
            itemLabel={kind === "cogs" ? "ingredients" : "orders"} className="px-0" />
        </fieldset>}
      </DialogContent>
    </Dialog>
  );
}
