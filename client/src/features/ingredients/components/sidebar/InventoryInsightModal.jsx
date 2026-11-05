import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/date";

const amount = value => Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });

/** Full responsive detail view for sidebar inventory intelligence cards. */
export default function InventoryInsightModal({ item, kind, onClose, onPrimary, onSecondary, primaryLabel, secondaryLabel, primaryDisabled, secondaryDisabled }) {
  if (!item) return null;
  const facts = item.metadata ?? {};
  const isReorder = kind === "reorder";
  const isAlert = kind === "alert";
  const batches = facts.batches ?? [];
  const title = item.ingredient_name;
  const status = isReorder ? (Number(item.suggested_quantity) > 0 ? item.urgency : "No purchase needed") : (item.alert_type ?? facts.kind ?? "Stock alert");

  return <Dialog open={Boolean(item)} onOpenChange={open => { if (!open) onClose?.(); }}>
    <DialogContent className="flex max-h-[min(90vh,44rem)] w-[calc(100%-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:w-full">
      <DialogClose onClick={onClose} />
      <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
        <DialogTitle className="text-base">{title}</DialogTitle>
        <DialogDescription>{status}{item.unit ? ` · ${item.unit}` : ""}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
        {isReorder ? <>
          <div className="grid grid-cols-2 gap-3">
            <Fact label="Suggested purchase" value={`${amount(item.suggested_quantity)} ${item.unit}`} />
            <Fact label="Usable stock" value={`${amount(item.current_stock)} ${item.unit}`} />
            <Fact label="Expected use" value={facts.expected_use_available ? `${amount(facts.expected_use)} ${item.unit} / 7 days${facts.forecast_complete ? "" : " (partial)"}` : "Unavailable"} />
            <Fact label="Minimum stock" value={`${amount(facts.minimum_stock)} ${item.unit}`} />
          </div>
          <Section title="Recommendation"><p className="leading-relaxed">{item.reasoning}</p></Section>
          {facts.warnings?.length > 0 && <Section title="Warnings"><ul className="list-disc space-y-1 pl-5">{facts.warnings.map(w => <li key={w}>{w}</li>)}</ul></Section>}
          {batches.length > 0 && <Section title="Batches"><div className="space-y-2">{batches.map(batch => <p key={batch.batch_id}>Batch #{batch.batch_id} · {amount(batch.remaining)} {item.unit}{batch.expires ? ` · ${batch.expires < facts.as_of ? "Expired" : "Expires"} ${formatDate(batch.expires)}` : ""}</p>)}</div></Section>}
        </> : isAlert ? <>
          <div className="grid grid-cols-2 gap-3"><Fact label="Status" value={item.alert_type?.replaceAll("_", " ") ?? "Stock alert"} /><Fact label="Quantity" value={`${amount(item.batch_quantity_left ?? item.stock_at_trigger)} ${item.unit}`} /></div>
          {item.expiry_date && <Section title="Expiry"><p>{item.expiry_date}{item.days_until_expiry != null ? ` · ${item.days_until_expiry} day${item.days_until_expiry === 1 ? "" : "s"} remaining` : ""}</p></Section>}
        </> : <>
          <div className="grid grid-cols-2 gap-3"><Fact label="Affected stock" value={`${amount((facts.batches ?? []).reduce((sum, b) => sum + Number(b.quantity ?? b.remaining ?? 0), 0))} ${item.unit}`} /><Fact label="Type" value={facts.kind?.replaceAll("_", " ") ?? "Waste insight"} /></div>
          <Section title="Recommendation"><p className="leading-relaxed">{item.suggestion}</p></Section>
          {batches.length > 0 && <Section title="Batches"><div className="space-y-2">{batches.map(batch => <p key={batch.batch_id}>Batch #{batch.batch_id} · {amount(batch.quantity ?? batch.remaining)} {item.unit} · {batch.expired ? "Expired" : "Expires"} {batch.expiry_date ? formatDate(batch.expiry_date) : "not recorded"}</p>)}</div></Section>}
        </>}
        {item.stale_reason && <p className="rounded-md bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">Needs refresh: {item.stale_reason}</p>}
      </div>
      {(onPrimary || onSecondary) && <DialogFooter className="shrink-0 flex-wrap border-t border-border px-5 py-3">
        {onSecondary && <Button variant="ghost" onClick={onSecondary} disabled={secondaryDisabled}>{secondaryLabel}</Button>}
        {onPrimary && <Button variant="primary" onClick={onPrimary} disabled={primaryDisabled}>{primaryLabel}</Button>}
      </DialogFooter>}
    </DialogContent>
  </Dialog>;
}

function Fact({ label, value }) { return <div className="rounded-md bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium text-foreground">{value}</p></div>; }
function Section({ title, children }) { return <section><h4 className="mb-1 font-medium text-foreground">{title}</h4>{children}</section>; }
