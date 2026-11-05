import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";

const amount = value => Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

/** Full responsive list view opened from an inventory intelligence section title. */
export default function InventoryInsightCollectionModal({ open, onClose, title, description, items, kind, onPrimary, onSecondary, primaryLabel, secondaryLabel, primaryDisabled }) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose?.(); }}>
    <DialogContent className="flex max-h-[min(90vh,48rem)] w-[calc(100%-1.5rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
      <DialogClose onClick={onClose} />
      <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {items?.map(item => {
          const facts = item.metadata ?? {};
          const batches = facts.batches ?? [];
          const isReorder = kind === "reorder";
          const isAlert = kind === "alert";
          return <article key={item.id ?? item.alert_id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium text-foreground">{item.ingredient_name}</h3><p className="text-xs capitalize text-muted-foreground">{isReorder ? (Number(item.suggested_quantity) > 0 ? item.urgency : "No purchase needed") : (item.alert_type ?? facts.kind?.replaceAll("_", " ") ?? "Stock alert")}</p></div></div>
            {isReorder ? <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Fact label="Suggested purchase" value={`${amount(item.suggested_quantity)} ${item.unit}`} /><Fact label="Usable stock" value={`${amount(item.current_stock)} ${item.unit}`} /><Fact label="Expected use" value={facts.expected_use_available ? `${amount(facts.expected_use)} ${item.unit} / 7 days${facts.forecast_complete ? "" : " (partial)"}` : "Unavailable"} /><Fact label="Minimum stock" value={`${amount(facts.minimum_stock)} ${item.unit}`} /></div> : isAlert ? <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Fact label="Status" value={item.alert_type?.replaceAll("_", " ")} /><Fact label="Quantity" value={`${amount(item.batch_quantity_left ?? item.stock_at_trigger)} ${item.unit}`} /></div> : <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Fact label="Affected stock" value={`${amount(batches.reduce((sum, b) => sum + Number(b.quantity ?? b.remaining ?? 0), 0))} ${item.unit}`} /><Fact label="Type" value={facts.kind?.replaceAll("_", " ") ?? "Waste insight"} /></div>}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{isReorder ? "Reason" : "Recommendation"}: </span>{isReorder ? item.reasoning : isAlert ? (item.alert_type === "expired" ? `Review the expired ${item.ingredient_name} batch before recording its loss.` : "Review stock and restock when needed.") : item.suggestion}</p>
            {item.created_at && <p className="mt-2 text-xs text-muted-foreground">Generated: {formatDate(item.created_at, "dateTime")} (Manila)</p>}
            {isReorder && <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>Minimum stock: {amount(facts.minimum_stock)} {item.unit}</p>
              {Number(facts.minimum_required) > 0 && <p>Minimum required: {amount(facts.minimum_required)} {item.unit}</p>}
              {Number(facts.expired_stock) > 0 && <p>Expired stock excluded: {amount(facts.expired_stock)} {item.unit}{batches.filter(b => b.expires && b.expires < facts.as_of).length ? ` · ${batches.filter(b => b.expires && b.expires < facts.as_of).map(b => `Batch #${b.batch_id}`).join(", ")}` : ""}</p>}
              {batches.filter(b => b.expires && b.expires >= facts.as_of).map(b => <p key={`expiry-${b.batch_id}`}>Expiring soon: Batch #{b.batch_id} · {amount(b.remaining)} {item.unit} · {formatDate(b.expires)}</p>)}
              {(facts.warnings ?? []).map(warning => <p key={warning} className="text-amber-700 dark:text-amber-400">{warning}</p>)}
            </div>}
            {!isReorder && !isAlert && <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              {facts.kind === "expiry_watch" && <p>{!(facts.forecast_dates ?? []).length ? "No usable predictions for the upcoming dates." : "Some dates through expiry have no predictions."}</p>}
              {facts.kind === "expiry_risk" && <p>Estimated unused at expiry: {amount(facts.at_risk_quantity)} {item.unit} · based on available predictions</p>}
              {facts.kind === "excess_stock" && <p>Assessment: Stock exceeds forecasted seven-day usage. This is excess inventory, not confirmed waste.</p>}
              {facts.kind === "expiry_risk" && <p>Assessment: Some stock is predicted to remain unused before expiry. Review batch priority.</p>}
              {facts.kind === "expiry_watch" && <p>Assessment: Review upcoming use because available predictions do not cover expiry.</p>}
            </div>}
            {item.expiry_date && <p className="mt-2 text-xs text-muted-foreground">Expiry: {formatDate(item.expiry_date)}</p>}
            {batches.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{batches.map(b => `Batch #${b.batch_id} · ${amount(b.quantity ?? b.remaining)} ${item.unit}${b.expiry_date || b.expires ? ` · ${formatDate(b.expiry_date ?? b.expires)}` : ""}`).join("; ")}</p>}
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="primary" className="h-7 text-xs" onClick={() => onPrimary?.(item)} disabled={primaryDisabled?.(item)}>{primaryLabel}</Button><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSecondary?.(item)}>{secondaryLabel}</Button></div>
          </article>;
        })}
      </div>
    </DialogContent>
  </Dialog>;
}

function Fact({ label, value }) { return <div className="rounded-md bg-muted/40 p-2"><p className="text-muted-foreground">{label}</p><p className="mt-0.5 font-medium text-foreground">{value}</p></div>; }
