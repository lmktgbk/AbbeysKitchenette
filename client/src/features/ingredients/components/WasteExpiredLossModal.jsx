import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/date";
import { formatPeso } from "@/lib/money";

/** A whole-batch expiry write-off draft. The backend rechecks the saved insight and batch before deduction. */
export default function WasteExpiredLossModal({ selection, onClose, onConfirm, isLoading }) {
  if (!selection) return null;
  const { insight, batch } = selection;
  const cost = batch.cost_per_unit == null ? null : Number(batch.quantity) * Number(batch.cost_per_unit);
  const close = () => { if (!isLoading) onClose(); };
  return <Dialog open onOpenChange={close}>
    <DialogContent>
      <DialogClose onClick={close} />
      <DialogHeader>
        <DialogTitle>Record expired loss</DialogTitle>
        <DialogDescription>{insight.ingredient_name} · Batch #{batch.batch_id}</DialogDescription>
      </DialogHeader>
      <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); onConfirm(selection); }}>
        <label className="block text-sm font-medium">Batch<Input className="mt-1" value={`#${batch.batch_id} · Expired ${formatDate(batch.expiry_date)}`} readOnly /></label>
        <label className="block text-sm font-medium">Loss type<Input className="mt-1" value="Expiry" readOnly /></label>
        <label className="block text-sm font-medium">Remaining quantity ({insight.unit})<Input className="mt-1" value={batch.quantity} readOnly /></label>
        {cost != null && <p className="text-sm text-muted-foreground">Recorded ingredient cost: {formatPeso(cost, 2)}</p>}
        <p className="text-sm text-muted-foreground">Confirm disposal of this expired batch. Recording the loss deducts its remaining stock and creates a loss record. Changed batch information requires a refresh.</p>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close} disabled={isLoading}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={isLoading}>{isLoading ? "Recording…" : "Confirm expired loss"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
