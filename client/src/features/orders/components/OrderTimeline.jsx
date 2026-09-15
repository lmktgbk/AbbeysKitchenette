import Icon from "@/components/ui/icon";
import { formatDate, formatTime } from "@/lib/date";

const ORDER_FLOW = [
  { status: "pending", label: "Created", icon: "clock", timestampField: "created_at", actorFallback: "System" },
  { status: "accepted", label: "Accepted", icon: "check", timestampField: "accepted_at", actorField: "accepted_by", actorFallback: "System" },
  { status: "preparing", label: "Preparing", icon: "coffee", timestampField: "preparing_at", actorField: "preparing_by", actorFallback: "System" },
  { status: "completed", label: "Completed", icon: "checkCircle", timestampField: "completed_at", actorField: "completed_by", actorFallback: "System" },
];

const CANCELLED_STEP = { status: "cancelled", label: "Cancelled", icon: "x", timestampField: "cancelled_at", actorField: "cancelled_by", actorFallback: "System" };

const STATUS_INDEX = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  completed: 3,
  cancelled: -1,
};

const CANCEL_REASON_LABELS = {
  customer_changed_mind: "Customer changed mind",
  wrong_order: "Wrong order",
  duplicate: "Duplicate order",
  out_of_stock: "Out of stock",
  all_items_removed: "All items removed",
  other: "Other",
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
 * Shows the main lifecycle flow:
 * - Created → Accepted → Preparing → Completed
 * - Cancelled as final step when applicable
 */
export default function OrderTimeline({ order }) {
  if (!order) return null;

  const isCancelled = order.status === "cancelled";

  let visibleSteps;
  let lastCompletedIdx;

  if (isCancelled) {
    const flowWithoutCompleted = ORDER_FLOW.filter((s) => s.status !== "completed");
    lastCompletedIdx = -1;
    for (let i = flowWithoutCompleted.length - 1; i >= 0; i--) {
      if (order[flowWithoutCompleted[i].timestampField]) {
        lastCompletedIdx = i;
        break;
      }
    }
    visibleSteps = [...flowWithoutCompleted, CANCELLED_STEP];
  } else {
    visibleSteps = ORDER_FLOW;
    lastCompletedIdx = (STATUS_INDEX[order.status] ?? -1) - 1;
  }

  const currentIdx = isCancelled ? visibleSteps.length - 1 : (STATUS_INDEX[order.status] ?? -1);

  return (
    <div className="flex flex-col">
      {/* ── STATUS SECTION ── */}
      <p className="mb-2.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
      {visibleSteps.map((step, idx) => {
        const isCompleted = isCancelled ? idx <= lastCompletedIdx : idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const timestamp = order[step.timestampField];
        const actor = step.actorField ? order[step.actorField] : null;
        const actorLabel = formatActor(actor) || (!actor && !timestamp ? null : step.actorFallback);
        const isLast = idx === visibleSteps.length - 1;

        const isCancelledStep = step.status === "cancelled";

        return (
          <div key={step.status} className="flex items-start gap-2.5">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  isCancelledStep
                    ? "border-red-500 bg-red-500 text-white"
                    : isCompleted
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
              <p className={`text-xs font-medium leading-tight ${
                isCancelledStep
                  ? "text-red-600 dark:text-red-400"
                  : isCurrent
                    ? "text-foreground"
                    : isCompleted
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
              }`}>
                {step.label}
                {isCancelledStep && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-px text-[9px] font-medium text-red-600 dark:text-red-400">
                    Terminal
                  </span>
                )}
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
              {isCancelledStep && order.cancel_reason && (
                <p className="text-[11px] text-muted-foreground italic mt-0.5 leading-tight">
                  {CANCEL_REASON_LABELS[order.cancel_reason] || order.cancel_reason}
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
    </div>
  );
}
