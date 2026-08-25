import { useOrderStats } from "../query";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

/**
 * QueueBoard
 *
 * Compact panel showing the current kitchen queue:
 * - Now Serving: order in processing
 * - Next Up: order next in line
 * Quick action buttons to advance or cancel.
 */
export default function QueueBoard({ orders, onAdvance, onCancel, onViewDetail }) {
  const processing = orders?.find((o) => o.status === "processing");
  const nextInLine = orders?.find((o) => o.status === "next_in_line");

  const hasQueue = processing || nextInLine;

  if (!hasQueue) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="coffee" size={18} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold">Kitchen Queue</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Now Serving */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Now Serving
          </p>
          {processing ? (
            <QueueCard
              order={processing}
              variant="processing"
              onAdvance={onAdvance}
              onView={onViewDetail}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">No orders</p>
            </div>
          )}
        </div>

        {/* Next Up */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Next Up
          </p>
          {nextInLine ? (
            <QueueCard
              order={nextInLine}
              variant="next"
              onAdvance={onAdvance}
              onView={onViewDetail}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
              <p className="text-xs text-muted-foreground">No orders</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueueCard({ order, variant, onAdvance, onView }) {
  const bgColor = variant === "processing"
    ? "border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20"
    : "border-purple-200 bg-purple-50 dark:border-purple-900/50 dark:bg-purple-950/20";

  const nextStatus = variant === "processing" ? "completed" : "processing";
  const nextLabel = variant === "processing" ? "Complete" : "Start";

  return (
    <div className={`rounded-lg border px-4 py-3 ${bgColor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-sm font-bold">#{order.order_number}</p>
          <p className="text-sm">{order.customer_name}</p>
          <p className="text-xs text-muted-foreground">Table {order.table_number}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            {order.items?.length ?? 0} items
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => onView?.(order)}
        >
          View
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => onAdvance?.(order.order_id, nextStatus)}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
