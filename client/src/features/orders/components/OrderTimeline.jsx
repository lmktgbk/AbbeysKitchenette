import Icon from "@/components/ui/icon";
import { formatDate, formatTime } from "@/lib/date";

const ORDER_FLOW = [
  { status: "pending", label: "Created", icon: "clock", timestampField: "created_at", actorFallback: "System" },
  { status: "accepted", label: "Accepted", icon: "check", timestampField: "accepted_at", actorField: "accepted_by", actorFallback: "System" },
  { status: "preparing", label: "Preparing", icon: "coffee", timestampField: "preparing_at", actorField: "preparing_by", actorFallback: "System" },
  { status: "completed", label: "Completed", icon: "checkCircle", timestampField: "completed_at", actorField: "completed_by", actorFallback: "System" },
];

const STATUS_INDEX = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  completed: 3,
  cancelled: -1,
};

function formatActor(actor) {
  if (!actor) return null;
  if (typeof actor === "string") return actor;
  if (actor.name) return actor.role ? `${actor.name} (${actor.role})` : actor.name;
  return null;
}

/**
 * OrderTimeline — compact vertical step indicator.
 *
 * Split into two sections:
 * - STATUS: Main lifecycle flow
 * - ACTIVITY: Item removals, refunds, cancellations
 */
export default function OrderTimeline({ order }) {
  if (!order) return null;

  const currentIdx = STATUS_INDEX[order.status] ?? -1;
  const isCancelled = order.status === "cancelled";

  const visibleSteps = isCancelled
    ? ORDER_FLOW.filter((s) => s.status !== "completed")
    : ORDER_FLOW;

  const itemRemovals = order?.item_removals || {};
  const removalEntries = Object.entries(itemRemovals).filter(([key]) => key !== "order");

  const hasActivity = removalEntries.length > 0 || order?.refund || isCancelled;

  return (
    <div className="flex flex-col">
      {/* ── STATUS SECTION ── */}
      <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
      {visibleSteps.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const timestamp = order[step.timestampField];
        const actor = step.actorField ? order[step.actorField] : null;
        const actorLabel = formatActor(actor) || (!actor && !timestamp ? null : step.actorFallback);
        const isLast = idx === visibleSteps.length - 1 && !hasActivity;

        return (
          <div key={step.status} className="flex items-start gap-2.5">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${isCompleted
                  ? "border-green-500 bg-green-500 text-white"
                  : isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground"
                  }`}
              >
                <Icon name={step.icon} size={10} />
              </div>
              {!isLast && (
                <div className={`w-0.5 h-4 ${isCompleted ? "bg-green-500" : "bg-border"}`} />
              )}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-xs font-medium leading-tight ${isCurrent ? "text-foreground" : isCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                }`}>
                {step.label}
                {isCurrent && !isCancelled && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                    Current
                  </span>
                )}
              </p>
              {timestamp && (
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {formatDate(timestamp, "shortDate")} {formatTime(timestamp)}
                </p>
              )}
              {actorLabel && (
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {actorLabel}
                </p>
              )}
            </div>
          </div>
        );
      })}

      {/* ── ACTIVITY SECTION ── */}
      {hasActivity && (
        <>
          <div className="my-3 border-t border-border/60" />
          <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Activity</p>

          {/* Item removal events */}
          {removalEntries.map(([itemId, removals]) => {
            if (!removals || removals.length === 0) return null;

            const itemLabel = removals[0]?.product_name
              || order?.items?.find((i) => String(i.order_item_id) === String(itemId))
                ?.product_name
              || `Item #${itemId}`;

            const totalLossCost = removals.reduce((sum, r) => sum + Number(r.total_cost_lost || 0), 0);
            const firstRemoval = removals[0];

            return (
              <div key={`removal-${itemId}`} className="flex items-start gap-2.5">
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-amber-500 bg-amber-500 text-white">
                    <Icon name="minus" size={10} />
                  </div>
                  <div className="w-0.5 h-4 bg-border" />
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 leading-tight">
                    {itemLabel} removed
                  </p>
                  {firstRemoval.logged_at && (
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      {formatDate(firstRemoval.logged_at, "shortDate")} {formatTime(firstRemoval.logged_at)}
                    </p>
                  )}
                  {totalLossCost > 0 && (
                    <p className="text-[11px] text-destructive leading-tight">
                      Loss: ₱{totalLossCost.toLocaleString()}
                    </p>
                  )}
                  {firstRemoval.declared_by && (
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      by {firstRemoval.declared_by.name} ({firstRemoval.declared_by.role})
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Refund event */}
          {order?.refund && (
            <div className="flex items-start gap-2.5">
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-500 text-white">
                  <Icon name="banknote" size={10} />
                </div>
                {isCancelled && <div className="w-0.5 h-4 bg-border" />}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 leading-tight">
                  Refund: ₱{order.refund.amount.toLocaleString()}
                </p>
                {order.refund.refunded_at && (
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {formatDate(order.refund.refunded_at, "shortDate")} {formatTime(order.refund.refunded_at)}
                  </p>
                )}
                {order.refund.item_name && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {order.refund.item_name}
                  </p>
                )}
                {order.refund.refunded_by && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    by {order.refund.refunded_by.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cancelled status */}
          {isCancelled && (
            <div className="flex items-start gap-2.5">
              <div className="flex flex-col items-center">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 text-white">
                  <Icon name="x" size={10} />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 leading-tight">
                  Cancelled
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-px text-[9px] font-medium text-red-600 dark:text-red-400">
                    Terminal
                  </span>
                </p>
                {order.cancelled_at && (
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {formatDate(order.cancelled_at, "shortDate")} {formatTime(order.cancelled_at)}
                  </p>
                )}
                {order.cancel_reason && (
                  <p className="text-[11px] text-muted-foreground italic mt-0.5 leading-tight">
                    {order.cancel_reason}
                  </p>
                )}
                {order.cancelled_by && (
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    by {order.cancelled_by.name} ({order.cancelled_by.role})
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
