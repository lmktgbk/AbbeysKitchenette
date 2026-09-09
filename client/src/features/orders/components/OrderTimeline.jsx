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
 * Designed for narrow side panel (w-52).
 */
export default function OrderTimeline({ order }) {
  if (!order) return null;

  const currentIdx = STATUS_INDEX[order.status] ?? -1;
  const isCancelled = order.status === "cancelled";

  const visibleSteps = isCancelled
    ? ORDER_FLOW.filter((s) => s.status !== "completed")
    : ORDER_FLOW;

  return (
    <div className="flex flex-col">
      {visibleSteps.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const timestamp = order[step.timestampField];
        const actor = step.actorField ? order[step.actorField] : null;
        const actorLabel = formatActor(actor) || (!actor && !timestamp ? null : step.actorFallback);

        return (
          <div key={step.status} className="flex items-start gap-2.5">
            {/* Dot + connector */}
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
              {idx < visibleSteps.length - 1 && (
                <div className={`w-0.5 h-4 ${isCompleted ? "bg-green-500" : "bg-border"}`} />
              )}
            </div>

            {/* Label + detail */}
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-xs font-medium leading-tight ${isCurrent ? "text-foreground" : isCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                }`}>
                {step.label}
                {isCurrent && !isCancelled && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">
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

      {isCancelled && (
        <div className="flex items-start gap-2.5">
          <div className="flex flex-col items-center">
            {/* Connector from Processing to Cancelled */}
            <div className="w-0.5 h-4 bg-border" />
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 text-white">
              <Icon name="x" size={10} />
            </div>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              Cancelled
              <span className="ml-1.5 inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-px text-[10px] font-medium text-red-600 dark:text-red-400">
                Terminal
              </span>
            </p>
            {order.cancelled_at && (
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                {formatDate(order.cancelled_at, "shortDate")} {formatTime(order.cancelled_at)}
              </p>
            )}
            {order.cancel_reason && (
              <p className="text-[11px] text-muted-foreground italic mt-0.5">
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
    </div>
  );
}
