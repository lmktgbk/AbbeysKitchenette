import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

export default function ConfirmReadyModal({ order, open, onConfirm, onCancel, loading }) {
  if (!open || !order) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card border border-border rounded-lg w-full max-w-sm shadow-2xl text-center px-6 py-8 kds-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 kds-pulse-ring bg-primary/10 border-2 border-primary/30">
          <Icon name="check" size={32} className="text-primary" />
        </div>
        <div className="text-base font-bold mb-1 text-foreground">
          Mark Order as Ready?
        </div>
        <div className="text-[11px] mb-2 text-muted-foreground">
          {order.customer_name} · Table {order.table_number} · This will advance the queue.
        </div>
        <div className="bg-muted border border-border rounded-xl px-4 py-3 mb-5 text-center">
          <div className="text-[10px] mb-0.5 text-muted-foreground">Order</div>
          <div className="font-serif text-xl font-bold text-primary">
            #{order.order_number}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-primary text-primary-foreground font-bold"
            onClick={onConfirm}
            disabled={loading}
          >
            <Icon name="check" size={16} />
            {loading ? "Saving…" : "Mark as Ready"}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
