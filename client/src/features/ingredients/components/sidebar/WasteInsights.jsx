import { useState } from "react";
import { toast } from "sonner";
import { useIngredientMutations, useWasteReductions } from "../../query";
import { confirm } from "@/components/alerts/ConfirmDialog";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { formatDate } from "@/lib/date";
import WasteExpiredLossModal from "../WasteExpiredLossModal";

const types = {
  expired_stock: { label: "Expired", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  expiry_risk: { label: "Expiring soon", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  expiry_watch: { label: "Check expiry", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  excess_stock: { label: "Excess stock", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};
const amount = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });

/** Concern-specific advice. Only confirmed loss and priority actions can mutate inventory. */
export default function WasteInsights() {
  const { data, isLoading, isError } = useWasteReductions();
  const mutations = useIngredientMutations();
  const [expandedId, setExpandedId] = useState(null);
  const [lossSelection, setLossSelection] = useState(null);
  const [batchSelection, setBatchSelection] = useState(null);
  const insights = data?.data?.insights ?? [];
  const busy = mutations.generateWaste.isPending || mutations.prioritizeWaste.isPending || mutations.wasteExpiredLoss.isPending || mutations.acceptWaste.isPending || mutations.rejectWaste.isPending;

  async function openBatchAction(insight, batch) {
    if (insight.metadata.kind === "expired_stock") {
      setBatchSelection(null);
      setLossSelection({ insight, batch });
    } else {
      // SweetAlert targets the focused dialog. Keep that dialog mounted until
      // confirmation finishes, otherwise its popup is removed with the chooser.
      const confirmed = await prioritize(insight, batch);
      if (confirmed) setBatchSelection(null);
    }
  }

  function acknowledge(insight) {
    const facts = insight.metadata ?? {};
    const eligible = (facts.batches ?? []).filter(batch => Number(batch.quantity) > 0 && (
      facts.kind === "expired_stock" ? batch.expired
        : ["expiry_risk", "expiry_watch"].includes(facts.kind) && !batch.expired && !batch.priority
    ));
    if (eligible.length === 1) return openBatchAction(insight, eligible[0]);
    if (eligible.length > 1) return setBatchSelection({ insight, batches: eligible });
    mutations.acceptWaste.mutate(insight.id, {
      onSuccess: () => toast.success("Insight acknowledged"),
      onError: error => toast.error(error.response?.data?.message || "Could not acknowledge insight"),
    });
  }

  function generate() {
    mutations.generateWaste.mutate(undefined, {
      onSuccess: result => toast.success(`Generated ${result?.data?.insights?.length ?? 0} waste insights`),
      onError: error => toast.error(error.response?.data?.message || "Failed to generate waste insights"),
    });
  }

  async function prioritize(insight, batch) {
    const ok = await confirm({ title: "Prioritize this batch?", message: `${insight.ingredient_name} · Batch #${batch.batch_id}`,
      note: "Use this batch first for subsequent deductions. When it is empty or expired, order deductions continue with the next usable FIFO batch. This does not consume stock.",
      confirmLabel: "Prioritize batch", loadingText: "Updating priority…", variant: "warning",
      onConfirm: () => mutations.prioritizeWaste.mutateAsync({ id: insight.id, batchId: batch.batch_id }) });
    if (ok) toast.success(`Batch #${batch.batch_id} prioritized`);
    return ok;
  }

  async function recordLoss({ insight, batch }) {
    const ok = await confirm({ title: "Record expired loss?", message: `${amount(batch.quantity)} ${insight.unit} of ${insight.ingredient_name} · Batch #${batch.batch_id}`,
      note: "This deducts the expired batch and records its ingredient cost as a loss. This cannot be undone.",
      confirmLabel: "Record loss", loadingText: "Recording…", variant: "danger",
      onConfirm: () => mutations.wasteExpiredLoss.mutateAsync({ id: insight.id, batchId: batch.batch_id }) });
    if (ok) { setLossSelection(null); toast.success("Expired loss recorded"); }
  }

  async function dismiss(id) {
    if (await confirm({ title: "Dismiss insight?", message: "Hide this insight without changing stock or batch priority.", confirmLabel: "Dismiss", variant: "warning" })) {
      mutations.rejectWaste.mutate(id, { onError: error => toast.error(error.response?.data?.message || "Failed to dismiss insight") });
    }
  }

  return <>
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="trendingDown" size={16} className="text-destructive" />
          <h3 className="text-sm font-semibold">Waste Insights</h3>
          {insights.length > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{insights.length}</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={generate} disabled={busy} aria-label="Generate waste insights" aria-busy={mutations.generateWaste.isPending}>
          <Icon name={mutations.generateWaste.isPending ? "loader" : "sparkles"} size={14} className={mutations.generateWaste.isPending ? "animate-spin" : ""} />
        </Button>
      </div>
      <div className="min-h-0 max-h-[32rem] overflow-y-auto lg:max-h-none lg:flex-1">
        {isLoading ? <div className="space-y-3 p-4"><Skeleton className="h-4 w-32" /><Skeleton className="h-16 w-full" /></div>
          : isError ? <p className="p-4 text-sm text-destructive">Could not load insights. Refresh to retry.</p>
            : !insights.length ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Icon name="checkCircle" size={24} className="mx-auto mb-2 text-green-500" />No pending waste insights
              <p className="mt-1 text-xs">Click <Icon name="sparkles" size={10} className="inline" /> to review stock concerns.</p>
            </div> : <div className="divide-y divide-border">{insights.map(insight => {
              const facts = insight.metadata ?? {};
              const type = types[facts.kind] ?? types.expiry_watch;
              const batches = facts.batches ?? [];
              const canAct = !insight.stale_reason && facts.policy_version === 3 && !busy;
              const expanded = expandedId === insight.id;
              const forecastDates = [...(facts.forecast_dates ?? [])].sort();
              const assessment = {
                expired_stock: "Stock remains in expired batches. Review disposal and record the confirmed loss.",
                expiry_risk: "Some stock is predicted to remain unused before expiry. Review batch priority.",
                expiry_watch: "Prediction dates do not fully cover these batches through expiry. Review upcoming use.",
                excess_stock: "Stock exceeds forecasted seven-day usage. Consider delaying purchases.",
              }[facts.kind];
              return <div key={insight.id} className="px-4 py-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 break-words text-sm font-medium text-foreground">{insight.ingredient_name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${type.color}`}>{type.label}</span>
                </div>
                <div className="mt-2 space-y-1 break-words">
                {facts.kind === "excess_stock" ? <>
                  <p className="font-medium text-foreground">Usable stock: {amount(facts.usable_stock ?? insight.current_stock)} {insight.unit}</p>
                  <p>Forecasted use · next 7 days: {amount(insight.forecasted_weekly_usage)} {insight.unit}</p>
                </> : <>
                  <p className="font-medium text-foreground">{facts.kind === "expired_stock" ? "Expired stock" : "Affected stock"}: {amount(batches.reduce((sum, b) => sum + Number(b.quantity), 0))} {insight.unit}</p>
                  {facts.kind === "expiry_watch" && <p>Forecast does not cover this expiry date.</p>}
                  {facts.kind === "expiry_risk" && <p>Estimated unused at expiry: {amount(facts.at_risk_quantity)} {insight.unit} · based on available predictions</p>}
                </>}
                <p className="leading-relaxed"><span className="font-medium text-foreground">Recommendation: </span>{insight.suggestion}</p>
                {insight.stale_reason && <p className="text-amber-700 dark:text-amber-400">Needs refresh: {insight.stale_reason}</p>}
                </div>
                <button className="mt-1 text-primary hover:underline" onClick={() => setExpandedId(expanded ? null : insight.id)} aria-expanded={expanded}>{expanded ? "Hide details" : "Details"}</button>
                {expanded && <div className="mt-2 space-y-1 break-words leading-relaxed">
                  <p>Generated: {formatDate(insight.created_at, "dateTime")} (Manila)</p>
                  {facts.kind !== "expired_stock" && forecastDates.length > 0 && <p>Forecast period: {formatDate(forecastDates[0])}{forecastDates.length > 1 ? ` – ${formatDate(forecastDates.at(-1))}` : ""}</p>}
                  {facts.kind === "expiry_watch" && <p>{!forecastDates.length ? "No usable predictions for the upcoming dates." : "Some dates through expiry have no predictions."}</p>}
                  {batches.map(batch => <p key={batch.batch_id}>Batch #{batch.batch_id} · {amount(batch.quantity)} {insight.unit} · {batch.expired ? "Expired" : "Expires"} {formatDate(batch.expiry_date)}{batch.priority ? " · Prioritized" : ""}</p>)}
                  {assessment && <p>Assessment: {assessment}</p>}
                </div>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" className="h-7 text-xs" disabled={!canAct} onClick={() => acknowledge(insight)}>Acknowledge</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy || mutations.rejectWaste.isPending} onClick={() => dismiss(insight.id)}>Dismiss</Button>
                </div>
              </div>;
            })}</div>}
      </div>
    </div>
    <WasteExpiredLossModal selection={lossSelection} onClose={() => setLossSelection(null)} onConfirm={recordLoss} isLoading={mutations.wasteExpiredLoss.isPending} />
    <Dialog open={Boolean(batchSelection)} onOpenChange={open => { if (!open) setBatchSelection(null); }}>
      <DialogContent>
        <DialogClose onClick={() => setBatchSelection(null)} />
        <DialogHeader>
          <DialogTitle>{batchSelection?.insight.metadata.kind === "expired_stock" ? "Select expired batch" : "Select batch to prioritize"}</DialogTitle>
          <DialogDescription>{batchSelection?.insight.ingredient_name} · Choose a batch to review before confirming.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {batchSelection?.batches.map(batch => <Button key={batch.batch_id} variant="secondary" className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => openBatchAction(batchSelection.insight, batch)}>
            Batch #{batch.batch_id} · {amount(batch.quantity)} {batchSelection.insight.unit} · {formatDate(batch.expiry_date)}
          </Button>)}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
